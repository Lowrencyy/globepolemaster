import { useState, useEffect, useMemo } from 'react'
import type { SyntheticEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { cacheDel, cacheGet, cacheSet } from '../../lib/cache'
import { canAccessWarehouse, getToken, getUser, SKYCABLE_API } from '../../lib/auth'

interface StockItem {
  id: string
  name: string
  category: string
  qty: number
  unit: string
  threshold: number
  icon: string
  location: string
}

interface DeliveryItem {
  itemName: string
  itemType: string
  qty: number
  unit?: string
}

type MovementType = 'delivery' | 'transfer' | 'pullout'

interface Delivery {
  id: string
  apiId?: number
  reference: string
  trackingToken: string
  movementType: MovementType
  siteName: string
  subconName: string
  status: 'pending' | 'dispatched' | 'delivered'
  date: string
  items: DeliveryItem[]
  fromWarehouseId?: number
  toWarehouseId?: number
  fromWarehouseName?: string
  toWarehouseName?: string
  notes?: string | null
  source?: string
}

interface WarehouseSite {
  id: string
  dbId?: number
  subconName: string
  warehouseName: string
  area: string
  status: 'operational' | 'near_capacity' | 'attention'
  capacityUsed: number
  capacityMax: number
  materialKinds: number
  lowStockItems: number
  openDispatches: number
  lastAudit: string
}

interface WarehouseStockItem extends StockItem {
  itemType: string
  warehouseId?: number
  warehouseSlug: string
  warehouseName: string
  subconName: string
  stockQty: number
  acceptedQty: number
  lastMovement?: string
}

interface ApiSubcontractor {
  id?: number
  name?: string
  company?: string
  address?: string
}

interface ApiWarehouseStock {
  id?: number
  item_type?: string
  quantity?: number | string
  unit?: string
}

interface ApiWarehouse {
  id?: number
  subcontractor_id?: number | null
  name?: string
  type?: string
  address?: string | null
  sqm?: number | string | null
  status?: string
  stocks?: ApiWarehouseStock[]
  subcontractor?: ApiSubcontractor | null
  created_at?: string
  updated_at?: string
}

interface ApiDeliveryItem {
  item_type?: string
  name?: string
  quantity?: number | string
  qty?: number | string
  unit?: string
}

interface ApiDelivery {
  id?: number
  status?: string
  type?: string
  movement_type?: string
  reference?: string
  tracking_no?: string
  tracking_number?: string
  token?: string
  delivery_token?: string
  movement_token?: string
  request_token?: string
  date?: string
  created_at?: string
  dispatched_at?: string | null
  arrived_at?: string | null
  accepted_at?: string | null
  approved_at?: string | null
  notes?: string | null
  items?: ApiDeliveryItem[]
  total_cable?: number | string | null
  total_node?: number | string | null
  total_amplifier?: number | string | null
  total_extender?: number | string | null
  total_tsc?: number | string | null
  total_psu?: number | string | null
  total_psu_case?: number | string | null
  span_count?: number
  team?: { id?: number; name?: string } | null
  approved_by?: { name?: string } | null
  from_warehouse_id?: number
  to_warehouse_id?: number
  from_warehouse?: ApiWarehouse | null
  to_warehouse?: ApiWarehouse | null
  fromWarehouse?: ApiWarehouse | null
  toWarehouse?: ApiWarehouse | null
}

interface PaginatedResponse<T> {
  data?: T[]
}

type DeliveryStatus = Delivery['status']
type WarehouseStatus = WarehouseSite['status']
type StockOption = StockItem | WarehouseStockItem
type WarehouseUser = {
  role_name?: string
  role?: string
}

const MOVEMENT_META: Record<MovementType, {
  label: string
  noun: string
  icon: string
  prefix: string
}> = {
  delivery: { label: 'Delivery request', noun: 'Delivery', icon: 'bx-send', prefix: 'DLV' },
  transfer: { label: 'Warehouse transfer', noun: 'Transfer', icon: 'bx-transfer-alt', prefix: 'TRF' },
  pullout: { label: 'Pull-out request', noun: 'Pull-out', icon: 'bx-log-out-circle', prefix: 'PUL' },
}

const authHeaders = () => ({
  Accept: 'application/json',
  Authorization: `Bearer ${getToken()}`,
  'ngrok-skip-browser-warning': '1',
})

const WAREHOUSE_STATUS_META: Record<WarehouseStatus, {
  label: string
  pill: string
  bar: string
  icon: string
}> = {
  operational: {
    label: 'Operational',
    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40',
    bar: 'bg-emerald-500',
    icon: 'bx-check-shield',
  },
  near_capacity: {
    label: 'Near capacity',
    pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-900/40',
    bar: 'bg-amber-500',
    icon: 'bx-error-circle',
  },
  attention: {
    label: 'Needs review',
    pill: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-900/40',
    bar: 'bg-rose-500',
    icon: 'bx-error',
  },
}

const DELIVERY_STATUS_META: Record<DeliveryStatus, {
  label: string
  pill: string
  dot: string
  icon: string
}> = {
  pending: {
    label: 'Pending',
    pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-900/40',
    dot: 'bg-amber-500',
    icon: 'bx-time-five',
  },
  dispatched: {
    label: 'In transit',
    pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-900/40',
    dot: 'bg-blue-500',
    icon: 'bx-trip',
  },
  delivered: {
    label: 'Delivered',
    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40',
    dot: 'bg-emerald-500',
    icon: 'bx-check-circle',
  },
}

const DELIVERY_PROGRESS: Record<DeliveryStatus, number> = {
  pending: 18,
  dispatched: 58,
  delivered: 100,
}

const DELIVERY_LOCATION: Record<DeliveryStatus, string> = {
  pending: 'Warehouse staging bay',
  dispatched: 'On route to site perimeter',
  delivered: 'Received by site engineer',
}

function formatDeliveryDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
}

function getDeliveryUnits(delivery: Delivery) {
  return delivery.items.reduce((sum, item) => sum + item.qty, 0)
}

function toNumber(value: number | string | null | undefined) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeArray<T>(payload: T[] | PaginatedResponse<T>): T[] {
  if (Array.isArray(payload)) return payload
  return payload.data ?? []
}

const STOCK_ITEM_META: Record<string, {
  name: string
  category: string
  icon: string
  threshold: number
}> = {
  cable: { name: 'Fiber Cable', category: 'Cables', icon: 'bx-plug', threshold: 500 },
  node: { name: 'Network Nodes', category: 'Hardware', icon: 'bx-buildings', threshold: 10 },
  amplifier: { name: 'Amplifiers', category: 'Hardware', icon: 'bx-broadcast', threshold: 15 },
  extender: { name: 'Extenders', category: 'Hardware', icon: 'bx-pulse', threshold: 10 },
  tsc: { name: 'TSC Materials', category: 'Accessories', icon: 'bx-box', threshold: 10 },
  powersupply: { name: 'Power Supplies', category: 'Electrical', icon: 'bx-bolt', threshold: 8 },
  power_supply: { name: 'Power Supplies', category: 'Electrical', icon: 'bx-bolt', threshold: 8 },
  psu: { name: 'Power Supplies', category: 'Electrical', icon: 'bx-bolt', threshold: 8 },
  ps_housing: { name: 'PS Housing', category: 'Electrical', icon: 'bx-cabinet', threshold: 8 },
  psu_case: { name: 'PSU Cases', category: 'Electrical', icon: 'bx-cabinet', threshold: 8 },
  powersupply_case: { name: 'PSU Cases', category: 'Electrical', icon: 'bx-cabinet', threshold: 8 },
  pole: { name: 'Utility Poles', category: 'Structures', icon: 'bx-current-location', threshold: 30 },
}

function stockMeta(itemType: string | undefined) {
  const key = String(itemType ?? '').toLowerCase()
  return STOCK_ITEM_META[key] ?? {
    name: key ? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Warehouse Item',
    category: 'Materials',
    icon: 'bx-package',
    threshold: 10,
  }
}

function slugifyText(value: string | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'warehouse'
}

function warehouseRouteSlug(warehouse: WarehouseSite) {
  return slugifyText(`${warehouse.warehouseName}-${warehouse.dbId ?? warehouse.id}`)
}

function subcontractorRouteSlug(warehouse: WarehouseSite) {
  return slugifyText(warehouse.subconName)
}

function warehouseMatchesRouteSlug(warehouse: WarehouseSite, slug: string | undefined) {
  if (!slug) return true
  return warehouseRouteSlug(warehouse) === slug ||
    subcontractorRouteSlug(warehouse) === slug ||
    slugifyText(warehouse.id) === slug
}

function getStockOptionItemType(item: StockOption) {
  if ('itemType' in item) return item.itemType
  const name = item.name.toLowerCase()
  if (name.includes('cable')) return 'cable'
  if (name.includes('pole')) return 'pole'
  if (name.includes('node')) return 'node'
  if (name.includes('amplifier')) return 'amplifier'
  if (name.includes('extender')) return 'extender'
  if (name.includes('power') || name.includes('psu')) return 'powersupply'
  if (name.includes('battery')) return 'battery'
  if (name.includes('closure')) return 'splice_closure'
  return item.id.toLowerCase()
}

function makeMovementReference(type: MovementType) {
  const stamp = Date.now().toString(36).toUpperCase()
  return `${MOVEMENT_META[type].prefix}-${stamp}`
}

function hasWarehouseTag(delivery: Delivery) {
  return Boolean(delivery.fromWarehouseId || delivery.toWarehouseId || delivery.fromWarehouseName || delivery.toWarehouseName)
}

function deliveryMatchesWarehouse(delivery: Delivery, warehouse: WarehouseSite) {
  if (delivery.fromWarehouseId && delivery.fromWarehouseId === warehouse.dbId) return true
  if (delivery.toWarehouseId && delivery.toWarehouseId === warehouse.dbId) return true
  const warehouseNames = [
    warehouse.warehouseName,
    warehouse.subconName,
    warehouse.area,
  ].map(slugifyText)
  const deliveryNames = [
    delivery.fromWarehouseName,
    delivery.toWarehouseName,
    delivery.siteName,
    delivery.subconName,
  ].map(slugifyText)
  return deliveryNames.some(name => warehouseNames.includes(name))
}

function deliveryStatusFromApi(status: string | undefined): DeliveryStatus {
  const normalized = String(status ?? '').toLowerCase()
  if (['accepted', 'approved', 'collected', 'delivered', 'received'].includes(normalized)) return 'delivered'
  if (['in_transit', 'arrived', 'dispatched', 'released'].includes(normalized)) return 'dispatched'
  return 'pending'
}

function getWarehousePercent(warehouse: WarehouseSite) {
  if (warehouse.capacityMax <= 0) return 0
  return Math.round((warehouse.capacityUsed / warehouse.capacityMax) * 100)
}

function isOpenDelivery(status: string | undefined) {
  return !['accepted', 'approved', 'collected', 'delivered', 'received', 'rejected'].includes(String(status ?? '').toLowerCase())
}

function deliveryItemsFromApi(delivery: ApiDelivery): DeliveryItem[] {
  const directItems = (delivery.items ?? [])
    .map(item => {
      const itemType = String(item.item_type ?? item.name ?? 'item').toLowerCase()
      return {
        itemName: stockMeta(itemType).name,
        itemType,
        qty: toNumber(item.quantity ?? item.qty),
        unit: item.unit,
      }
    })
    .filter(item => item.qty > 0)

  if (directItems.length > 0) return directItems

  return [
    { itemType: 'cable', qty: toNumber(delivery.total_cable), unit: 'm' },
    { itemType: 'node', qty: toNumber(delivery.total_node), unit: 'pcs' },
    { itemType: 'amplifier', qty: toNumber(delivery.total_amplifier), unit: 'pcs' },
    { itemType: 'extender', qty: toNumber(delivery.total_extender), unit: 'pcs' },
    { itemType: 'tsc', qty: toNumber(delivery.total_tsc), unit: 'pcs' },
    { itemType: 'powersupply', qty: toNumber(delivery.total_psu), unit: 'pcs' },
    { itemType: 'ps_housing', qty: toNumber(delivery.total_psu_case), unit: 'pcs' },
  ]
    .filter(item => item.qty > 0)
    .map(item => ({
      ...item,
      itemName: stockMeta(item.itemType).name,
    }))
}

function movementTypeFromApi(delivery: ApiDelivery, fromWarehouse: ApiWarehouse | null, toWarehouse: ApiWarehouse | null): MovementType {
  const rawType = String(delivery.movement_type ?? delivery.type ?? '').toLowerCase()
  if (rawType.includes('pull')) return 'pullout'
  if (rawType.includes('transfer')) return 'transfer'
  if (fromWarehouse && toWarehouse) return 'transfer'
  if (fromWarehouse && !toWarehouse) return 'pullout'
  return 'delivery'
}

function mapApiDeliveries(apiDeliveries: ApiDelivery[]): Delivery[] {
  return apiDeliveries.map(delivery => {
    const fromWarehouse = delivery.from_warehouse ?? delivery.fromWarehouse ?? null
    const toWarehouse = delivery.to_warehouse ?? delivery.toWarehouse ?? null
    const date = delivery.dispatched_at ||
      delivery.arrived_at ||
      delivery.accepted_at ||
      delivery.approved_at ||
      delivery.date ||
      delivery.created_at ||
      new Date().toISOString()
    const movementType = movementTypeFromApi(delivery, fromWarehouse, toWarehouse)
    const reference = delivery.reference ||
      delivery.tracking_no ||
      delivery.tracking_number ||
      delivery.token ||
      (delivery.id ? `D${delivery.id}` : makeMovementReference(movementType))
    const trackingToken = delivery.delivery_token ||
      delivery.movement_token ||
      delivery.request_token ||
      delivery.token ||
      reference
    const items = deliveryItemsFromApi(delivery)
    const subconName = toWarehouse?.subcontractor?.name ||
                       fromWarehouse?.subcontractor?.name ||
                       toWarehouse?.subcontractor?.company ||
                       fromWarehouse?.subcontractor?.company ||
                       delivery.team?.name ||
                       'Warehouse Operations'
    const siteName = toWarehouse?.name ||
      (delivery.team?.name ? `${delivery.team.name} collected materials` : '') ||
      (delivery.span_count ? `${delivery.span_count} collected span deliveries` : '') ||
      'Destination warehouse'

    return {
      id: reference,
      apiId: delivery.id,
      reference,
      trackingToken,
      movementType,
      siteName,
      subconName,
      status: deliveryStatusFromApi(delivery.status),
      date: date.split('T')[0],
      items,
      fromWarehouseId: delivery.from_warehouse_id ?? fromWarehouse?.id,
      toWarehouseId: delivery.to_warehouse_id ?? toWarehouse?.id,
      fromWarehouseName: fromWarehouse?.name,
      toWarehouseName: toWarehouse?.name,
      notes: delivery.notes,
      source: delivery.total_cable !== undefined || delivery.span_count !== undefined
        ? 'Field collections'
        : MOVEMENT_META[movementType].label,
    }
  })
}

function mapApiWarehousesToSites(apiWarehouses: ApiWarehouse[], apiDeliveries: ApiDelivery[]): WarehouseSite[] {
  return apiWarehouses.map(warehouse => {
    const stocks = warehouse.stocks ?? []
    const capacityUsed = stocks.reduce((sum, stock) => sum + toNumber(stock.quantity), 0)
    const savedCapacity = toNumber(warehouse.sqm)
    const capacityMax = savedCapacity > 0 ? savedCapacity : Math.max(100, Math.ceil(capacityUsed * 1.25))
    const percent = capacityMax > 0 ? Math.round((capacityUsed / capacityMax) * 100) : 0
    const lowStockItems = stocks.filter(stock => toNumber(stock.quantity) <= stockMeta(stock.item_type).threshold).length
    const status: WarehouseStatus = warehouse.status !== 'active'
      ? 'attention'
      : percent >= 85
        ? 'near_capacity'
        : lowStockItems >= 3
          ? 'attention'
          : 'operational'
    const openDispatches = apiDeliveries.filter(delivery => {
      const fromWarehouseId = delivery.from_warehouse_id ?? delivery.from_warehouse?.id ?? delivery.fromWarehouse?.id
      const toWarehouseId = delivery.to_warehouse_id ?? delivery.to_warehouse?.id ?? delivery.toWarehouse?.id
      return isOpenDelivery(delivery.status) && (fromWarehouseId === warehouse.id || toWarehouseId === warehouse.id)
    }).length

    return {
      id: `WH-${warehouse.id ?? warehouse.name ?? 'warehouse'}`,
      dbId: warehouse.id,
      subconName: warehouse.subcontractor?.name || warehouse.subcontractor?.company || (warehouse.type === 'main' ? 'TelcoVantage' : 'Unassigned Subcontractor'),
      warehouseName: warehouse.name || 'Unnamed Warehouse',
      area: warehouse.address || warehouse.subcontractor?.address || `${warehouse.type ?? 'warehouse'} warehouse`,
      status,
      capacityUsed,
      capacityMax,
      materialKinds: stocks.length,
      lowStockItems,
      openDispatches,
      lastAudit: (warehouse.updated_at || warehouse.created_at || new Date().toISOString()).split('T')[0],
    }
  })
}

function mapApiWarehousesToStocks(apiWarehouses: ApiWarehouse[]): StockItem[] {
  const grouped = new Map<string, StockItem>()

  apiWarehouses.forEach(warehouse => {
    ;(warehouse.stocks ?? []).forEach(stock => {
      const itemType = String(stock.item_type ?? 'item').toLowerCase()
      const meta = stockMeta(itemType)
      const current = grouped.get(itemType)
      const qty = toNumber(stock.quantity)

      if (current) {
        current.qty += qty
        current.location = 'All subcontractor warehouses'
        return
      }

      grouped.set(itemType, {
        id: itemType,
        name: meta.name,
        category: meta.category,
        qty,
        unit: stock.unit || 'pcs',
        threshold: meta.threshold,
        icon: meta.icon,
        location: warehouse.name || 'Warehouse',
      })
    })
  })

  return Array.from(grouped.values())
}

function makeWarehouseStockRow(warehouse: WarehouseSite, itemType: string, unit: string | undefined): WarehouseStockItem {
  const meta = stockMeta(itemType)
  return {
    id: `${warehouseRouteSlug(warehouse)}-${itemType}`,
    itemType,
    name: meta.name,
    category: meta.category,
    qty: 0,
    unit: unit || 'pcs',
    threshold: meta.threshold,
    icon: meta.icon,
    location: warehouse.warehouseName,
    warehouseId: warehouse.dbId,
    warehouseSlug: warehouseRouteSlug(warehouse),
    warehouseName: warehouse.warehouseName,
    subconName: warehouse.subconName,
    stockQty: 0,
    acceptedQty: 0,
  }
}

function mapApiWarehousesToWarehouseStocks(apiWarehouses: ApiWarehouse[], deliveries: Delivery[]): WarehouseStockItem[] {
  const warehouseSites = mapApiWarehousesToSites(apiWarehouses, [])
  const rows = new Map<string, WarehouseStockItem>()

  warehouseSites.forEach(warehouse => {
    const apiWarehouse = apiWarehouses.find(item => item.id === warehouse.dbId)

    ;(apiWarehouse?.stocks ?? []).forEach(stock => {
      const itemType = String(stock.item_type ?? 'item').toLowerCase()
      const key = `${warehouseRouteSlug(warehouse)}-${itemType}`
      const row = rows.get(key) ?? makeWarehouseStockRow(warehouse, itemType, stock.unit)
      const qty = toNumber(stock.quantity)
      row.stockQty += qty
      row.qty = row.stockQty > 0 ? row.stockQty : row.acceptedQty
      row.unit = stock.unit || row.unit
      rows.set(key, row)
    })

    deliveries
      .filter(delivery => delivery.status === 'delivered' && deliveryMatchesWarehouse(delivery, warehouse))
      .forEach(delivery => {
        delivery.items.forEach(item => {
          const key = `${warehouseRouteSlug(warehouse)}-${item.itemType}`
          const row = rows.get(key) ?? makeWarehouseStockRow(warehouse, item.itemType, item.unit)
          row.acceptedQty += item.qty
          row.qty = row.stockQty > 0 ? row.stockQty : row.acceptedQty
          row.lastMovement = delivery.date
          row.unit = item.unit || row.unit
          rows.set(key, row)
        })
      })
  })

  return Array.from(rows.values())
}

function mapPreviewWarehouseStocks(warehouses: WarehouseSite[], stocks: StockItem[], deliveries: Delivery[]): WarehouseStockItem[] {
  return warehouses.flatMap(warehouse => {
    const baseRows = stocks.map(stock => ({
      ...stock,
      id: `${warehouseRouteSlug(warehouse)}-${stock.id}`,
      itemType: stock.id.toLowerCase(),
      warehouseId: warehouse.dbId,
      warehouseSlug: warehouseRouteSlug(warehouse),
      warehouseName: warehouse.warehouseName,
      subconName: warehouse.subconName,
      stockQty: Math.max(0, Math.round(stock.qty / Math.max(warehouses.length, 1))),
      acceptedQty: 0,
      qty: Math.max(0, Math.round(stock.qty / Math.max(warehouses.length, 1))),
      location: warehouse.warehouseName,
    }))

    const acceptedRows = deliveries
      .filter(delivery => delivery.status === 'delivered' && deliveryMatchesWarehouse(delivery, warehouse))
      .flatMap(delivery => delivery.items.map(item => {
        const meta = stockMeta(item.itemType)
        return {
          id: `${warehouseRouteSlug(warehouse)}-${item.itemType}-${delivery.id}`,
          itemType: item.itemType,
          name: meta.name,
          category: meta.category,
          qty: item.qty,
          unit: item.unit || 'pcs',
          threshold: meta.threshold,
          icon: meta.icon,
          location: warehouse.warehouseName,
          warehouseId: warehouse.dbId,
          warehouseSlug: warehouseRouteSlug(warehouse),
          warehouseName: warehouse.warehouseName,
          subconName: warehouse.subconName,
          stockQty: 0,
          acceptedQty: item.qty,
          lastMovement: delivery.date,
        }
      }))

    return [...baseRows, ...acceptedRows]
  })
}

const WAREHOUSE_PREVIEW: WarehouseSite[] = [
  {
    id: 'WH-CORE-MNL',
    subconName: 'CoreTech Inc.',
    warehouseName: 'CoreTech Manila Warehouse',
    area: 'Metro Manila',
    status: 'near_capacity',
    capacityUsed: 1740,
    capacityMax: 2000,
    materialKinds: 38,
    lowStockItems: 2,
    openDispatches: 4,
    lastAudit: '2026-05-18',
  },
  {
    id: 'WH-APEX-QZN',
    subconName: 'Apex Telecoms',
    warehouseName: 'Apex Quezon Depot',
    area: 'Quezon North',
    status: 'operational',
    capacityUsed: 1110,
    capacityMax: 1800,
    materialKinds: 31,
    lowStockItems: 0,
    openDispatches: 2,
    lastAudit: '2026-05-17',
  },
  {
    id: 'WH-VIS-CEB',
    subconName: 'Visayas Fiber Ltd.',
    warehouseName: 'Visayas Cebu South Hub',
    area: 'Cebu South',
    status: 'attention',
    capacityUsed: 520,
    capacityMax: 1200,
    materialKinds: 24,
    lowStockItems: 5,
    openDispatches: 3,
    lastAudit: '2026-05-16',
  },
  {
    id: 'WH-NLX-CL',
    subconName: 'Northline Contractors',
    warehouseName: 'Central Luzon Materials Yard',
    area: 'Central Luzon',
    status: 'operational',
    capacityUsed: 1480,
    capacityMax: 2300,
    materialKinds: 42,
    lowStockItems: 1,
    openDispatches: 1,
    lastAudit: '2026-05-18',
  },
]

const INITIAL_STOCKS: StockItem[] = [
  { id: 'S1', name: 'Fiber Cable Drums (1000m)', category: 'Cables', qty: 24, unit: 'drums', threshold: 5, icon: 'bx-plug', location: 'Rack A-3' },
  { id: 'S2', name: 'Utility Poles (Steel/Concrete)', category: 'Structures', qty: 180, unit: 'pcs', threshold: 30, icon: 'bx-current-location', location: 'Yard Section B' },
  { id: 'S3', name: 'Network Nodes', category: 'Hardware', qty: 45, unit: 'pcs', threshold: 10, icon: 'bx-buildings', location: 'Shelf C-1' },
  { id: 'S4', name: 'Amplifiers', category: 'Hardware', qty: 85, unit: 'pcs', threshold: 15, icon: 'bx-broadcast', location: 'Shelf C-2' },
  { id: 'S5', name: 'Extenders', category: 'Hardware', qty: 8, unit: 'pcs', threshold: 10, icon: 'bx-pulse', location: 'Shelf C-3' }, // Low stock initial
  { id: 'S6', name: 'Power Supplies (PSU)', category: 'Electrical', qty: 40, unit: 'pcs', threshold: 8, icon: 'bx-bolt', location: 'Shelf D-1' },
  { id: 'S7', name: 'Splice Closures', category: 'Accessories', qty: 3, unit: 'pcs', threshold: 15, icon: 'bx-box', location: 'Shelf D-4' }, // Low stock initial
  { id: 'S8', name: 'Backup Batteries (UPS)', category: 'Electrical', qty: 110, unit: 'pcs', threshold: 20, icon: 'bx-battery', location: 'Shelf D-2' },
]

const INITIAL_DELIVERIES: Delivery[] = [
  {
    id: 'W10091',
    reference: 'W10091',
    trackingToken: 'W10091',
    movementType: 'delivery',
    siteName: 'Manila Central Site A',
    subconName: 'CoreTech Inc.',
    status: 'dispatched',
    date: '2026-05-18',
    items: [{ itemName: 'Fiber Cable Drums (1000m)', itemType: 'cable', qty: 5, unit: 'drums' }],
    fromWarehouseName: 'CoreTech Manila Warehouse',
    source: 'Delivery request',
  },
  {
    id: 'W10092',
    reference: 'W10092',
    trackingToken: 'W10092',
    movementType: 'delivery',
    siteName: 'Quezon North Site B',
    subconName: 'Apex Telecoms',
    status: 'delivered',
    date: '2026-05-17',
    items: [{ itemName: 'Utility Poles (Steel/Concrete)', itemType: 'pole', qty: 40, unit: 'pcs' }],
    toWarehouseName: 'Apex Quezon Depot',
    source: 'Field collections',
  },
  {
    id: 'W10093',
    reference: 'W10093',
    trackingToken: 'W10093',
    movementType: 'transfer',
    siteName: 'Cebu South Node 2',
    subconName: 'Visayas Fiber Ltd.',
    status: 'pending',
    date: '2026-05-19',
    items: [
      { itemName: 'Network Nodes', itemType: 'node', qty: 10, unit: 'pcs' },
      { itemName: 'Amplifiers', itemType: 'amplifier', qty: 15, unit: 'pcs' },
    ],
    fromWarehouseName: 'Visayas Cebu South Hub',
    source: 'Warehouse transfer',
  },
]

export default function WarehouseInventory() {
  const user = getUser()
  const warehouseUser = user as WarehouseUser | null | undefined
  const userRoleLabel = warehouseUser?.role_name || warehouseUser?.role || 'Staff'
  const hasAccess = canAccessWarehouse()
  const location = useLocation()
  const navigate = useNavigate()
  const { subconSlug } = useParams<{ subconSlug?: string }>()

  // Navigation Tabs
  const activeTab = useMemo<'stocks' | 'deliveries'>(() => {
    const params = new URLSearchParams(location.search)
    return params.get('tab') === 'deliveries' ? 'deliveries' : 'stocks'
  }, [location.search])

  const handleTabChange = (tab: 'stocks' | 'deliveries') => {
    setSearchQuery('')
    const path = subconSlug ? `/warehouse/${subconSlug}/inventory` : '/warehouse/inventory'
    navigate(tab === 'deliveries' ? `${path}?tab=deliveries` : path, { replace: true })
  }

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  // Core Data States
  const [stocks, setStocks] = useState<StockItem[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [warehouseSites, setWarehouseSites] = useState<WarehouseSite[]>([])
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStockItem[]>([])
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const effectiveSelectedDeliveryId = useMemo(() => {
    if (selectedDeliveryId && deliveries.some(d => d.id === selectedDeliveryId)) {
      return selectedDeliveryId
    }
    const defaultDelivery = deliveries.find(d => d.status === 'dispatched') ||
                            deliveries.find(d => d.status === 'pending') ||
                            deliveries[0]
    return defaultDelivery?.id ?? null
  }, [deliveries, selectedDeliveryId])

  const selectedDelivery = useMemo(() => {
    return deliveries.find(d => d.id === effectiveSelectedDeliveryId) || null
  }, [deliveries, effectiveSelectedDeliveryId])

  const deliveryCounts = useMemo(() => {
    return deliveries.reduce(
      (acc, delivery) => {
        acc.total += 1
        acc[delivery.status] += 1
        acc.units += getDeliveryUnits(delivery)
        return acc
      },
      { total: 0, pending: 0, dispatched: 0, delivered: 0, units: 0 } as Record<DeliveryStatus | 'total' | 'units', number>
    )
  }, [deliveries])

  const selectedDeliveryUnits = selectedDelivery ? getDeliveryUnits(selectedDelivery) : 0
  const selectedDeliveryProgress = selectedDelivery ? DELIVERY_PROGRESS[selectedDelivery.status] : 0
  const selectedDeliveryMarker = Math.min(92, Math.max(8, selectedDeliveryProgress))
  const selectedDeliveryMeta = selectedDelivery ? DELIVERY_STATUS_META[selectedDelivery.status] : null

  const handleUpdateDeliveryStatus = (deliveryId: string, status: 'pending' | 'dispatched' | 'delivered') => {
    const previousDelivery = deliveries.find(d => d.id === deliveryId)
    const nextDeliveries = deliveries.map(d => {
      if (d.id === deliveryId) {
        return { ...d, status }
      }
      return d
    })
    let nextWarehouseStocks = warehouseStocks

    if (previousDelivery && previousDelivery.status !== 'delivered' && status === 'delivered') {
      const targetWarehouse = warehouseSites.find(warehouse => deliveryMatchesWarehouse(previousDelivery, warehouse)) || selectedWarehouse

      if (targetWarehouse) {
        previousDelivery.items.forEach(item => {
          const key = `${warehouseRouteSlug(targetWarehouse)}-${item.itemType}`
          const existing = nextWarehouseStocks.find(stock => stock.id === key)

          if (existing) {
            nextWarehouseStocks = nextWarehouseStocks.map(stock => {
              if (stock.id !== key) return stock
              return {
                ...stock,
                qty: stock.qty + item.qty,
                acceptedQty: stock.acceptedQty + item.qty,
                lastMovement: new Date().toISOString().split('T')[0],
              }
            })
            return
          }

          const created = makeWarehouseStockRow(targetWarehouse, item.itemType, item.unit)
          nextWarehouseStocks = [
            ...nextWarehouseStocks,
            {
              ...created,
              qty: item.qty,
              acceptedQty: item.qty,
              lastMovement: new Date().toISOString().split('T')[0],
            },
          ]
        })
      }
    }

    setDeliveries(nextDeliveries)
    setWarehouseStocks(nextWarehouseStocks)
    cacheSet('warehouse_deliveries_list_v2', nextDeliveries)
    cacheSet('warehouse_stocks_by_site_v2', nextWarehouseStocks)
  }

  // Modals
  const [receiveModal, setReceiveModal] = useState(false)
  const [dispatchModal, setDispatchModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Forms
  const [receiveForm, setReceiveForm] = useState({
    itemId: '',
    qty: '',
    location: '',
  })
  const [dispatchForm, setDispatchForm] = useState({
    movementType: 'delivery' as MovementType,
    siteName: '',
    subconName: '',
    itemId: '',
    qty: '',
    toWarehouseId: '',
    reason: '',
  })

  // Connection & Cache Sync Control states
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSynced, setLastSynced] = useState<number | null>(null)
  const [syncText, setSyncText] = useState('Never')

  // Calculate relative synced time
  useEffect(() => {
    function updateText() {
      if (!lastSynced) {
        setSyncText('Never')
        return
      }
      const diff = Date.now() - lastSynced
      const secs = Math.floor(diff / 1000)
      if (secs < 60) {
        setSyncText('Just now')
      } else {
        const mins = Math.floor(secs / 60)
        setSyncText(`${mins}m ago`)
      }
    }
    updateText()
    const timer = setInterval(updateText, 10000)
    return () => clearInterval(timer)
  }, [lastSynced])

  // Monitor connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // SWR Loader
  const loadData = async (silent = false, force = false) => {
    if (!silent) setLoading(true)

    const cacheStocks = cacheGet<StockItem[]>('warehouse_stocks_list_v2')
    const cacheDeliveries = cacheGet<Delivery[]>('warehouse_deliveries_list_v2')
    const cacheWarehouses = cacheGet<WarehouseSite[]>('warehouse_sites_list_v2')
    const cacheWarehouseStocks = cacheGet<WarehouseStockItem[]>('warehouse_stocks_by_site_v2')

    if (!force && cacheStocks && cacheDeliveries && cacheWarehouses) {
      setStocks(cacheStocks)
      setDeliveries(cacheDeliveries)
      setWarehouseSites(cacheWarehouses)
      setWarehouseStocks(cacheWarehouseStocks || mapPreviewWarehouseStocks(cacheWarehouses, cacheStocks, cacheDeliveries))
      setLoading(false)
      setLastSynced(Date.now() - 2000) // Sim synced just now

      if (silent) return
    }

    try {
      const [warehousesRes, deliveriesRes] = await Promise.all([
        fetch(`${SKYCABLE_API}/warehouses`, { headers: authHeaders() }),
        fetch(`${SKYCABLE_API}/deliveries`, { headers: authHeaders() }),
      ])

      if (!warehousesRes.ok) throw new Error('Unable to load warehouses')

      const warehousesPayload = await warehousesRes.json() as ApiWarehouse[] | PaginatedResponse<ApiWarehouse>
      const deliveriesPayload = deliveriesRes.ok
        ? await deliveriesRes.json() as ApiDelivery[] | PaginatedResponse<ApiDelivery>
        : { data: [] }

      const apiWarehouses = normalizeArray<ApiWarehouse>(warehousesPayload)
      const apiDeliveries = normalizeArray<ApiDelivery>(deliveriesPayload)
      const nextDeliveries = apiDeliveries.length ? mapApiDeliveries(apiDeliveries) : INITIAL_DELIVERIES

      const nextWarehouses = apiWarehouses.length ? mapApiWarehousesToSites(apiWarehouses, apiDeliveries) : WAREHOUSE_PREVIEW
      const nextStocks = apiWarehouses.length ? mapApiWarehousesToStocks(apiWarehouses) : INITIAL_STOCKS
      const nextWarehouseStocks = apiWarehouses.length
        ? mapApiWarehousesToWarehouseStocks(apiWarehouses, nextDeliveries)
        : mapPreviewWarehouseStocks(WAREHOUSE_PREVIEW, INITIAL_STOCKS, INITIAL_DELIVERIES)

      setStocks(nextStocks)
      setDeliveries(nextDeliveries)
      setWarehouseSites(nextWarehouses)
      setWarehouseStocks(nextWarehouseStocks)
      cacheSet('warehouse_stocks_list_v2', nextStocks)
      cacheSet('warehouse_deliveries_list_v2', nextDeliveries)
      cacheSet('warehouse_sites_list_v2', nextWarehouses)
      cacheSet('warehouse_stocks_by_site_v2', nextWarehouseStocks)
      setLoading(false)
      setLastSynced(Date.now())
    } catch (err) {
      console.warn('Warehouse API unavailable, using preview data', err)
      setStocks(cacheStocks || INITIAL_STOCKS)
      setDeliveries(cacheDeliveries || INITIAL_DELIVERIES)
      setWarehouseSites(cacheWarehouses || WAREHOUSE_PREVIEW)
      setWarehouseStocks(cacheWarehouseStocks || mapPreviewWarehouseStocks(WAREHOUSE_PREVIEW, INITIAL_STOCKS, INITIAL_DELIVERIES))
      setLoading(false)
      setLastSynced(Date.now())
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const handleManualSync = () => {
    if (syncing || !isOnline) return
    setSyncing(true)
    void loadData(true, true).finally(() => {
      setSyncing(false)
      setLastSynced(Date.now())
    })
  }

  const handleClearCache = () => {
    cacheDel('warehouse_stocks_list_v2')
    cacheDel('warehouse_deliveries_list_v2')
    cacheDel('warehouse_sites_list_v2')
    cacheDel('warehouse_stocks_by_site_v2')
    setStocks([])
    setDeliveries([])
    setWarehouseSites([])
    setWarehouseStocks([])
    setLastSynced(null)
    window.setTimeout(() => { void loadData(false) }, 150)
  }

  const persistMovementRequest = async (delivery: Delivery) => {
    try {
      const res = await fetch(`${SKYCABLE_API}/deliveries`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: delivery.date,
          status: delivery.status,
          movement_type: delivery.movementType,
          reference: delivery.reference,
          tracking_no: delivery.trackingToken,
          from_warehouse_id: delivery.fromWarehouseId ?? null,
          to_warehouse_id: delivery.toWarehouseId ?? null,
          destination: delivery.siteName,
          subcontractor: delivery.subconName,
          notes: delivery.notes,
          items: delivery.items.map(item => ({
            item_type: item.itemType,
            quantity: item.qty,
            unit: item.unit || 'pcs',
          })),
        }),
      })

      if (res.ok) {
        void loadData(true, true)
      }
    } catch (err) {
      console.warn('Unable to sync warehouse movement request yet; keeping local cache record.', err)
    }
  }

  const filteredWarehouses = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return warehouseSites.filter(warehouse => {
      const matchesSlug = warehouseMatchesRouteSlug(warehouse, subconSlug)
      const matchesSearch = !q ||
        warehouse.subconName.toLowerCase().includes(q) ||
        warehouse.warehouseName.toLowerCase().includes(q) ||
        warehouse.area.toLowerCase().includes(q) ||
        warehouse.id.toLowerCase().includes(q)
      return matchesSlug && matchesSearch
    })
  }, [searchQuery, warehouseSites, subconSlug])

  const selectedWarehouse = subconSlug
    ? warehouseSites.find(warehouse => warehouseMatchesRouteSlug(warehouse, subconSlug)) || null
    : null

  const selectedWarehouseStocks = useMemo(() => {
    if (!selectedWarehouse) return []
    const selectedSlug = warehouseRouteSlug(selectedWarehouse)
    return warehouseStocks.filter(item => {
      if (selectedWarehouse.dbId && item.warehouseId === selectedWarehouse.dbId) return true
      return item.warehouseSlug === selectedSlug || slugifyText(item.warehouseName) === slugifyText(selectedWarehouse.warehouseName)
    })
  }, [selectedWarehouse, warehouseStocks])

  const selectedWarehouseDeliveries = useMemo(() => {
    if (!selectedWarehouse) return []
    return deliveries.filter(delivery => {
      if (deliveryMatchesWarehouse(delivery, selectedWarehouse)) return true
      return delivery.status === 'delivered' && !hasWarehouseTag(delivery)
    })
  }, [deliveries, selectedWarehouse])

  const stockOptions = useMemo<StockOption[]>(() => {
    return selectedWarehouse ? selectedWarehouseStocks : stocks
  }, [selectedWarehouse, selectedWarehouseStocks, stocks])

  // Categories list
  const categories = useMemo(() => {
    const cats = new Set(stockOptions.map(s => s.category))
    return ['All', ...Array.from(cats)]
  }, [stockOptions])

  // Filtered Stock Items
  const filteredStocks = useMemo(() => {
    return stockOptions.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.location.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [stockOptions, searchQuery, categoryFilter])

  const selectedWarehouseStats = useMemo(() => {
    const acceptedDeliveries = selectedWarehouseDeliveries.filter(delivery => delivery.status === 'delivered')
    const openRequests = selectedWarehouseDeliveries.filter(delivery => delivery.status !== 'delivered')
    return {
      currentUnits: selectedWarehouseStocks.reduce((sum, item) => sum + item.qty, 0),
      acceptedUnits: acceptedDeliveries.reduce((sum, delivery) => sum + getDeliveryUnits(delivery), 0),
      acceptedDeliveries: acceptedDeliveries.length,
      openRequests: openRequests.length,
    }
  }, [selectedWarehouseDeliveries, selectedWarehouseStocks])

  const warehouseOverview = useMemo(() => {
    const source = warehouseSites.length ? warehouseSites : WAREHOUSE_PREVIEW
    const totalCapacity = source.reduce((sum, warehouse) => sum + warehouse.capacityMax, 0)
    const usedCapacity = source.reduce((sum, warehouse) => sum + warehouse.capacityUsed, 0)
    const highestWarehouse = source.reduce((highest, warehouse) => {
      return getWarehousePercent(warehouse) > getWarehousePercent(highest) ? warehouse : highest
    }, source[0])

    return {
      totalWarehouses: source.length,
      utilization: totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0,
      highestWarehouse,
      attentionWarehouses: source.filter(warehouse => warehouse.status !== 'operational').length,
      openDispatches: source.reduce((sum, warehouse) => sum + warehouse.openDispatches, 0),
    }
  }, [warehouseSites])

  // Deliveries List
  const filteredDeliveries = useMemo(() => {
    const source = selectedWarehouse ? selectedWarehouseDeliveries : deliveries
    return source.filter(d => {
      return d.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
             d.subconName.toLowerCase().includes(searchQuery.toLowerCase()) ||
             d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
             d.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
             d.trackingToken.toLowerCase().includes(searchQuery.toLowerCase())
    })
  }, [deliveries, searchQuery, selectedWarehouse, selectedWarehouseDeliveries])

  // Low stock warning total
  const lowStockCount = useMemo(() => {
    return stockOptions.filter(s => s.qty <= s.threshold).length
  }, [stockOptions])

  // Add/Receive Stock Handler
  const handleReceiveStock = (e: SyntheticEvent) => {
    e.preventDefault()
    if (!receiveForm.itemId || !receiveForm.qty) return

    setSaving(true)
    setTimeout(() => {
      const addedQty = Number(receiveForm.qty)
      const selectedItem = stockOptions.find(s => s.id === receiveForm.itemId)
      if (!selectedItem) {
        alert('Select a valid material item first.')
        setSaving(false)
        return
      }
      const itemType = getStockOptionItemType(selectedItem)

      const nextStocks = stocks.map(item => {
        if (item.id === receiveForm.itemId || getStockOptionItemType(item) === itemType || item.name === selectedItem.name) {
          return {
            ...item,
            qty: item.qty + addedQty,
            location: receiveForm.location || item.location,
          }
        }
        return item
      })
      const finalStocks = nextStocks.some(item => item.id === receiveForm.itemId || getStockOptionItemType(item) === itemType || item.name === selectedItem.name)
        ? nextStocks
        : [
          ...nextStocks,
          {
            id: itemType,
            name: selectedItem.name,
            category: selectedItem.category,
            qty: addedQty,
            unit: selectedItem.unit,
            threshold: selectedItem.threshold,
            icon: selectedItem.icon,
            location: receiveForm.location || selectedItem.location,
          },
        ]

      const nextWarehouseStocks = selectedWarehouse
        ? (() => {
          const existing = warehouseStocks.some(item => item.id === receiveForm.itemId)
          if (existing) {
            return warehouseStocks.map(item => {
              if (item.id !== receiveForm.itemId) return item
              return {
                ...item,
                qty: item.qty + addedQty,
                stockQty: item.stockQty + addedQty,
                location: receiveForm.location || item.location,
                lastMovement: new Date().toISOString().split('T')[0],
              }
            })
          }

          const created = makeWarehouseStockRow(selectedWarehouse, itemType, selectedItem.unit)
          return [
            ...warehouseStocks,
            {
              ...created,
              qty: addedQty,
              stockQty: addedQty,
              location: receiveForm.location || selectedWarehouse.warehouseName,
              lastMovement: new Date().toISOString().split('T')[0],
            },
          ]
        })()
        : warehouseStocks

      const reference = makeMovementReference('delivery')
      const receivedDelivery: Delivery = {
        id: reference,
        reference,
        trackingToken: reference,
        movementType: 'delivery',
        siteName: selectedWarehouse?.warehouseName || receiveForm.location || 'Warehouse receipt',
        subconName: selectedWarehouse?.subconName || 'Warehouse Operations',
        status: 'delivered',
        date: new Date().toISOString().split('T')[0],
        items: [{ itemName: selectedItem.name, itemType, qty: addedQty, unit: selectedItem.unit }],
        toWarehouseId: selectedWarehouse?.dbId,
        toWarehouseName: selectedWarehouse?.warehouseName,
        notes: receiveForm.location ? `Stored at ${receiveForm.location}` : 'Manual warehouse receipt',
        source: 'Manual receipt',
      }
      const nextDeliveries = [receivedDelivery, ...deliveries]

      setStocks(finalStocks)
      setWarehouseStocks(nextWarehouseStocks)
      setDeliveries(nextDeliveries)
      cacheSet('warehouse_stocks_list_v2', finalStocks)
      cacheSet('warehouse_stocks_by_site_v2', nextWarehouseStocks)
      cacheSet('warehouse_deliveries_list_v2', nextDeliveries)
      setReceiveForm({ itemId: '', qty: '', location: '' })
      setReceiveModal(false)
      setSaving(false)
    }, 500)
  }

  // Dispatch Delivery Handler (Decrements Stock Levels)
  const handleDispatch = (e: SyntheticEvent) => {
    e.preventDefault()
    if (!dispatchForm.itemId || !dispatchForm.qty) return
    if (dispatchForm.movementType === 'transfer' && !dispatchForm.toWarehouseId) return
    if (dispatchForm.movementType !== 'transfer' && !dispatchForm.siteName) return

    setSaving(true)
    setTimeout(() => {
      const dispatchQty = Number(dispatchForm.qty)
      const itemToDispatch = stockOptions.find(s => s.id === dispatchForm.itemId)

      if (!itemToDispatch || itemToDispatch.qty < dispatchQty) {
        alert(`Insufficient stock level. Available: ${itemToDispatch?.qty ?? 0} ${itemToDispatch?.unit ?? ''}`)
        setSaving(false)
        return
      }

      const itemType = getStockOptionItemType(itemToDispatch)
      const destinationWarehouse = dispatchForm.toWarehouseId
        ? warehouseSites.find(warehouse => String(warehouse.dbId) === dispatchForm.toWarehouseId)
        : null

      // Decrement stock level
      const nextStocks = stocks.map(item => {
        if (item.id === dispatchForm.itemId || getStockOptionItemType(item) === itemType || item.name === itemToDispatch.name) {
          return { ...item, qty: item.qty - dispatchQty }
        }
        return item
      })
      const nextWarehouseStocks = selectedWarehouse
        ? warehouseStocks.map(item => {
          if (item.id !== dispatchForm.itemId) return item
          return { ...item, qty: item.qty - dispatchQty, stockQty: Math.max(0, item.stockQty - dispatchQty) }
        })
        : warehouseStocks

      // Add Dispatch Record
      const reference = makeMovementReference(dispatchForm.movementType)
      const newDel: Delivery = {
        id: reference,
        reference,
        trackingToken: reference,
        movementType: dispatchForm.movementType,
        siteName: destinationWarehouse?.warehouseName || dispatchForm.siteName || MOVEMENT_META[dispatchForm.movementType].label,
        subconName: destinationWarehouse?.subconName || dispatchForm.subconName || selectedWarehouse?.subconName || 'Warehouse Operations',
        status: 'pending',
        date: new Date().toISOString().split('T')[0],
        items: [{ itemName: itemToDispatch.name, itemType, qty: dispatchQty, unit: itemToDispatch.unit }],
        fromWarehouseId: selectedWarehouse?.dbId,
        toWarehouseId: destinationWarehouse?.dbId,
        fromWarehouseName: selectedWarehouse?.warehouseName,
        toWarehouseName: destinationWarehouse?.warehouseName,
        notes: dispatchForm.reason || null,
        source: MOVEMENT_META[dispatchForm.movementType].label,
      }

      const nextDeliveries = [newDel, ...deliveries]

      setStocks(nextStocks)
      setWarehouseStocks(nextWarehouseStocks)
      setDeliveries(nextDeliveries)
      cacheSet('warehouse_stocks_list_v2', nextStocks)
      cacheSet('warehouse_stocks_by_site_v2', nextWarehouseStocks)
      cacheSet('warehouse_deliveries_list_v2', nextDeliveries)

      setDispatchForm({ movementType: 'delivery', siteName: '', subconName: '', itemId: '', qty: '', toWarehouseId: '', reason: '' })
      setDispatchModal(false)
      setSaving(false)
    }, 600)
  }

  if (!hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950 p-6">
        <div className="max-w-md text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 shadow-xl">
          <i className="bx bx-shield-quarter text-5xl text-rose-500 animate-pulse" />
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-800 dark:text-zinc-100">Access Denied</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">Your current account ({userRoleLabel}) does not have security authorization to manage warehouse inventory assets.</p>
          <Link to="/sites" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white hover:bg-emerald-700 transition shadow">
            Return to Nodes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(22,163,74,0.14),_transparent_34%),linear-gradient(180deg,#f8faf9_0%,#eef4ef_100%)] pb-12 text-slate-950 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[380px] overflow-hidden">
          <div className="absolute left-1/2 top-[-180px] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-green-500/20 blur-3xl" />
          <div className="absolute right-[-120px] top-20 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        </div>
        
        {/* Header Hero Section */}
        <div className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/80 p-5 shadow-[0_30px_100px_-60px_rgba(15,23,42,0.9)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/85 sm:p-6">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.22),_transparent_45%)] lg:block" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="font-bold text-slate-500">Warehouse Operations</span>
              <i className="bx bx-chevron-right text-sm" />
              <span className="font-bold text-slate-600 dark:text-slate-300">Inventory & Logistics</span>
            </nav>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-3xl font-black tracking-tight">Warehouse Command Center</h1>
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-black text-green-600 ring-1 ring-green-200 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-900/30">
                Premium ops rollup
              </span>
              {lowStockCount > 0 && (
                <span className="animate-pulse rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-900/30">
                  {lowStockCount} items low stock
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Cache Control Panel */}
            <div className="flex items-center gap-2 rounded-2xl bg-white/50 backdrop-blur-md border border-slate-200 px-3 py-1.5 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] text-xs select-none dark:bg-zinc-900/50 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 pr-2.5 border-r border-slate-200 dark:border-zinc-800">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                </span>
                <span className="font-bold text-slate-600 dark:text-zinc-300">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-slate-400 font-medium">
                <i className="bx bx-time-five text-sm" />
                <span>Synced:</span>
                <span className="font-black text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 leading-none dark:bg-zinc-800 dark:text-zinc-300">
                  {syncText}
                </span>
              </div>
              <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncing || !isOnline}
                  className={`flex h-6 w-6 items-center justify-center rounded-2xl text-slate-500 transition-all ${syncing ? 'animate-spin' : 'hover:bg-slate-100 hover:text-violet-500 dark:hover:bg-zinc-800'} disabled:opacity-50`}
                >
                  <i className="bx bx-refresh text-lg" />
                </button>
                <button
                  type="button"
                  onClick={handleClearCache}
                  className="flex h-6 w-6 items-center justify-center rounded-2xl text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 transition-all"
                >
                  <i className="bx bx-trash text-sm" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setReceiveModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-green-200 bg-white/90 px-4 py-2.5 text-sm font-black text-green-700 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] transition hover:border-green-300 hover:bg-green-50 dark:border-green-900/50 dark:bg-zinc-900 dark:text-green-300"
            >
              <i className="bx bx-plus-circle text-base" /> Receive Materials
            </button>
            <button
              onClick={() => setDispatchModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_18px_35px_-18px_rgba(22,163,74,0.85)] transition hover:-translate-y-0.5 hover:bg-green-700"
            >
              <i className="bx bx-send text-base" /> Dispatch Stock
            </button>
          </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] bg-white p-4 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] border border-slate-200/60 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="inline-flex rounded-2xl bg-slate-100 p-1 text-xs font-black dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => handleTabChange('stocks')}
              className={`inline-flex h-9 items-center gap-2 rounded-xl px-4 transition ${activeTab === 'stocks' ? 'bg-white text-green-700 shadow-sm dark:bg-zinc-800 dark:text-green-300' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
              <i className="bx bx-package" /> Inventory
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('deliveries')}
              className={`inline-flex h-9 items-center gap-2 rounded-xl px-4 transition ${activeTab === 'deliveries' ? 'bg-white text-green-700 shadow-sm dark:bg-zinc-800 dark:text-green-300' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
              <i className="bx bx-trip" /> Movements
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64 sm:flex-initial">
              <i className="bx bx-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base" />
              <input
                type="text"
                placeholder={activeTab === 'stocks'
                  ? selectedWarehouse ? 'Search materials, category, bay...' : 'Search warehouse, subcon, area...'
                  : 'Search movements, tokens, subcons...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl bg-slate-50 pl-10 pr-4 text-xs font-medium outline-none border border-slate-200/80 transition-all focus:border-green-400 focus:bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:focus:border-indigo-500"
              />
            </div>

            {/* Category Select Filter (Stocks only) */}
            {activeTab === 'stocks' && (
              <div className="flex items-center gap-1 bg-slate-50 rounded-xl px-2.5 border border-slate-200/80 dark:bg-zinc-950 dark:border-zinc-800">
                <i className="bx bx-filter text-slate-400 text-sm" />
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="h-10 bg-transparent text-xs font-semibold outline-none text-slate-600 dark:text-zinc-300"
                >
                  {categories.map(c => <option key={c} value={c} className="dark:bg-zinc-900">{c}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-green-600 border-t-transparent" />
          </div>
        ) : activeTab === 'stocks' ? (
          
          /* TAB 1: Administrator warehouse overview */
          <div className="space-y-5">
            {selectedWarehouse && (
              <section className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
                    <div className="min-w-0">
                      <Link to="/warehouse/inventory" className="inline-flex items-center gap-1.5 text-xs font-black text-green-700 hover:text-green-800 dark:text-green-300">
                        <i className="bx bx-arrow-back" /> All warehouses
                      </Link>
                      <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Warehouse Area</p>
                      <h2 className="mt-1 truncate text-2xl font-black tracking-tight text-slate-900 dark:text-zinc-50" title={selectedWarehouse.warehouseName}>
                        {selectedWarehouse.warehouseName}
                      </h2>
                      <p className="mt-1 text-sm font-bold text-slate-500 dark:text-zinc-400">
                        {selectedWarehouse.subconName} · {selectedWarehouse.area}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDispatchForm(f => ({ ...f, movementType: 'pullout', siteName: 'Pull-out request', subconName: selectedWarehouse.subconName }))
                          setDispatchModal(true)
                        }}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-500/10 dark:text-rose-300"
                      >
                        <i className="bx bx-log-out-circle text-base" /> Request Pull-out
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDispatchForm(f => ({ ...f, movementType: 'transfer', siteName: '', subconName: selectedWarehouse.subconName }))
                          setDispatchModal(true)
                        }}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-xs font-black text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-500/10 dark:text-blue-300"
                      >
                        <i className="bx bx-transfer-alt text-base" /> Transfer Warehouse
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Area stock units', value: selectedWarehouseStats.currentUnits, icon: 'bx-package', tone: 'bg-green-50 text-green-700 ring-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-900/40' },
                      { label: 'Accepted units', value: selectedWarehouseStats.acceptedUnits, icon: 'bx-check-circle', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40' },
                      { label: 'Accepted deliveries', value: selectedWarehouseStats.acceptedDeliveries, icon: 'bx-archive-in', tone: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-900/40' },
                      { label: 'Open requests', value: selectedWarehouseStats.openRequests, icon: 'bx-loader-circle', tone: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-900/40' },
                    ].map(card => (
                      <div key={card.label} className="rounded-2xl border border-slate-200/70 p-4 dark:border-zinc-800">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
                            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-zinc-50">{card.value}</p>
                          </div>
                          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${card.tone}`}>
                            <i className={`bx ${card.icon} text-xl`} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
                  <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Area Inventory</p>
                        <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-zinc-50">Available materials</h3>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-zinc-800 dark:text-zinc-300">
                        {filteredStocks.length} material rows
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] table-fixed border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-zinc-800 dark:bg-zinc-950">
                            <th className="w-[240px] px-4 py-3.5">Material</th>
                            <th className="w-[130px] px-4 py-3.5">Current</th>
                            <th className="w-[130px] px-4 py-3.5">Accepted</th>
                            <th className="px-4 py-3.5">Location</th>
                            <th className="w-[120px] px-4 py-3.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs dark:divide-zinc-800">
                          {filteredStocks.map(item => {
                            const acceptedQty = 'acceptedQty' in item ? item.acceptedQty : 0
                            const isLow = item.qty <= item.threshold
                            return (
                              <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/50">
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                                      <i className={`bx ${item.icon} text-lg`} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate font-black text-slate-900 dark:text-zinc-50" title={item.name}>{item.name}</p>
                                      <p className="mt-0.5 text-[11px] font-bold text-slate-400">{item.category}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <p className="font-black text-slate-800 dark:text-zinc-100">{item.qty.toLocaleString()} {item.unit}</p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Threshold {item.threshold}</p>
                                </td>
                                <td className="px-4 py-4">
                                  <p className="font-black text-emerald-700 dark:text-emerald-300">{acceptedQty.toLocaleString()} {item.unit}</p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-slate-400">from accepted logs</p>
                                </td>
                                <td className="px-4 py-4">
                                  <p className="truncate font-bold text-slate-600 dark:text-zinc-300" title={item.location}>{item.location}</p>
                                  {'lastMovement' in item && item.lastMovement && (
                                    <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Last {formatDeliveryDate(item.lastMovement)}</p>
                                  )}
                                </td>
                                <td className="px-4 py-4">
                                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${isLow ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-900/40' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40'}`}>
                                    {isLow ? 'Low' : 'Ready'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}

                          {filteredStocks.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-16 text-center text-slate-500">
                                <i className="bx bx-package text-4xl text-slate-300" />
                                <p className="mt-2 text-sm font-bold">No material rows match this area search.</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Accepted & Collected</p>
                      <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-zinc-50">Trace ledger</h3>
                    </div>
                    <div className="max-h-[520px] overflow-y-auto p-4">
                      <div className="space-y-3">
                        {selectedWarehouseDeliveries.map(delivery => {
                          const meta = DELIVERY_STATUS_META[delivery.status]
                          const movementMeta = MOVEMENT_META[delivery.movementType]
                          return (
                            <button
                              key={delivery.id}
                              type="button"
                              onClick={() => {
                                setSelectedDeliveryId(delivery.id)
                                handleTabChange('deliveries')
                              }}
                              className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-green-200 hover:bg-green-50/60 dark:border-zinc-800 dark:hover:border-green-900/50 dark:hover:bg-green-500/5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{movementMeta.label}</p>
                                  <p className="mt-1 truncate font-black text-slate-900 dark:text-zinc-50">#{delivery.reference}</p>
                                  <p className="mt-1 truncate text-[11px] font-bold text-slate-500 dark:text-zinc-400">{delivery.source || delivery.siteName}</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.pill}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {delivery.items.map((item, idx) => (
                                  <span key={idx} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                                    <span className="shrink-0">{item.qty}{item.unit ? ` ${item.unit}` : 'x'}</span>
                                    <span className="truncate">{item.itemName}</span>
                                  </span>
                                ))}
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-400">
                                <span>{formatDeliveryDate(delivery.date)}</span>
                                <span className="truncate">Token {delivery.trackingToken}</span>
                              </div>
                            </button>
                          )
                        })}

                        {selectedWarehouseDeliveries.length === 0 && (
                          <div className="py-14 text-center text-slate-500">
                            <i className="bx bx-archive-in text-4xl text-slate-300" />
                            <p className="mt-2 text-sm font-bold">No accepted or requested movements yet.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </section>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Subcon warehouses', value: warehouseOverview.totalWarehouses, icon: 'bx-store', tone: 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-green-600/10 dark:text-sky-300 dark:ring-sky-900/40' },
                { label: 'Network utilization', value: `${warehouseOverview.utilization}%`, icon: 'bx-pie-chart-alt-2', tone: 'bg-green-50 text-indigo-700 ring-indigo-100 dark:bg-green-500/10 dark:text-indigo-300 dark:ring-indigo-900/40' },
                { label: 'Max warehouse usage', value: `${getWarehousePercent(warehouseOverview.highestWarehouse)}%`, icon: 'bx-trending-up', tone: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-900/40' },
                { label: 'Open dispatches', value: warehouseOverview.openDispatches, icon: 'bx-trip', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40' },
              ].map(card => (
                <div key={card.label} className="rounded-2xl border border-white/70 bg-white/85 p-5 backdrop-blur-xl shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
                      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-zinc-50">{card.value}</p>
                    </div>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${card.tone}`}>
                      <i className={`bx ${card.icon} text-xl`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Network Intelligence</p>
                  <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-zinc-50">Subcontractor Warehouse Control Tower</h2>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Highest capacity use</p>
                  <p className="mt-1 text-sm font-black text-slate-800 dark:text-zinc-100">
                    {warehouseOverview.highestWarehouse.subconName} at {getWarehousePercent(warehouseOverview.highestWarehouse)}%
                  </p>
                </div>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-2 xl:grid-cols-4">
                {filteredWarehouses.map(warehouse => {
                  const percent = getWarehousePercent(warehouse)
                  const meta = WAREHOUSE_STATUS_META[warehouse.status]
                  return (
                    <div
                      key={warehouse.id}
                      onClick={() => navigate(`/warehouse/${warehouseRouteSlug(warehouse)}/inventory`)}
                      className="cursor-pointer rounded-2xl border border-white/70 bg-white/90 p-5 backdrop-blur-xl shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_70px_-38px_rgba(15,23,42,0.8)] dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{warehouse.id}</p>
                          <h3 className="mt-1 truncate text-base font-black text-slate-900 dark:text-zinc-50" title={warehouse.subconName}>{warehouse.subconName}</h3>
                          <p className="mt-1 truncate text-xs font-bold text-slate-500 dark:text-zinc-400" title={warehouse.warehouseName}>{warehouse.warehouseName}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${meta.pill}`}>
                          {meta.label}
                        </span>
                      </div>

                      <div className="mt-5">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Warehouse capacity</p>
                            <p className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-zinc-50">{percent}%</p>
                          </div>
                          <p className="pb-1 text-right text-[11px] font-bold text-slate-400">
                            {warehouse.capacityUsed.toLocaleString()} / {warehouse.capacityMax.toLocaleString()} units
                          </p>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                          <div className={`h-full rounded-full transition-all duration-500 ${meta.bar}`} style={{ width: `${percent}%` }} />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-xs dark:border-zinc-800">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Materials</p>
                          <p className="mt-1 font-black text-slate-800 dark:text-zinc-100">{warehouse.materialKinds}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Low stock</p>
                          <p className={`mt-1 font-black ${warehouse.lowStockItems > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-800 dark:text-zinc-100'}`}>{warehouse.lowStockItems}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dispatch</p>
                          <p className="mt-1 font-black text-slate-800 dark:text-zinc-100">{warehouse.openDispatches}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                        <span className="truncate">{warehouse.area}</span>
                        <span>Audited {formatDeliveryDate(warehouse.lastAudit)}</span>
                      </div>
                    </div>
                  )
                })}

                {filteredWarehouses.length === 0 && (
                  <div className="col-span-full py-14 text-center">
                    <i className="bx bx-store-alt text-4xl text-slate-300" />
                    <p className="mt-2 text-sm font-bold text-slate-500">No subcontractor warehouses match this search.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          
          /* TAB 2: Delivery operations command view */
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Open dispatches', value: deliveryCounts.pending + deliveryCounts.dispatched, icon: 'bx-loader-circle', tone: 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-green-600/10 dark:text-sky-300 dark:ring-sky-900/40' },
                { label: 'In transit', value: deliveryCounts.dispatched, icon: 'bx-trip', tone: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-900/40' },
                { label: 'Delivered', value: deliveryCounts.delivered, icon: 'bx-check-circle', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/40' },
                { label: 'Units loaded', value: deliveryCounts.units, icon: 'bx-package', tone: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700' },
              ].map(card => (
                <div key={card.label} className="rounded-2xl border border-white/70 bg-white/85 p-5 backdrop-blur-xl shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
                      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-zinc-50">{card.value}</p>
                    </div>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${card.tone}`}>
                      <i className={`bx ${card.icon} text-xl`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
              <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dispatch Queue</p>
                    <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-zinc-50">Delivery Tracker</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                    {(Object.keys(DELIVERY_STATUS_META) as DeliveryStatus[]).map(status => {
                      const meta = DELIVERY_STATUS_META[status]
                      return (
                        <span key={status} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      )
                    })}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-zinc-800 dark:bg-zinc-950">
                        <th className="w-[120px] px-4 py-3.5">Dispatch</th>
                        <th className="w-[120px] px-4 py-3.5">Type</th>
                        <th className="w-[170px] px-4 py-3.5">Destination</th>
                        <th className="w-[130px] px-4 py-3.5">Contractor</th>
                        <th className="px-4 py-3.5">Loadout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs dark:divide-zinc-800">
                      {filteredDeliveries.map(d => {
                        const meta = DELIVERY_STATUS_META[d.status]
                        const movementMeta = MOVEMENT_META[d.movementType]
                        const isSelected = effectiveSelectedDeliveryId === d.id
                        return (
                          <tr
                            key={d.id}
                            onClick={() => setSelectedDeliveryId(d.id)}
                            className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-zinc-800/60 ${isSelected ? 'bg-green-50/80 dark:bg-zinc-800/80' : ''}`}
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <span className={`h-10 w-1 rounded-full ${meta.dot}`} />
                                <div>
                                  <p className="font-black text-slate-900 dark:text-zinc-50">#{d.id}</p>
                                  <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-400">{formatDeliveryDate(d.date)}</p>
                                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.pill}`}>
                                    <i className={`bx ${meta.icon} text-xs`} />
                                    {meta.label}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-black text-slate-800 dark:text-zinc-100">{movementMeta.noun}</p>
                              <p className="mt-1 max-w-[110px] truncate font-mono text-[11px] font-semibold text-slate-400" title={d.trackingToken}>{d.trackingToken}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="max-w-[170px] truncate font-black text-slate-800 dark:text-zinc-100" title={d.siteName}>{d.siteName}</p>
                              <p className="mt-1 text-[11px] font-semibold text-slate-400">{getDeliveryUnits(d)} units scheduled</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="max-w-[120px] truncate font-bold text-slate-600 dark:text-zinc-300" title={d.subconName}>{d.subconName}</p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="max-w-[180px] space-y-1">
                                {d.items.map((item, idx) => (
                                  <span key={idx} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                                    <span className="shrink-0">{item.qty}{item.unit ? ` ${item.unit}` : 'x'}</span>
                                    <span className="truncate">{item.itemName}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}

                      {filteredDeliveries.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-16 text-center text-slate-500">
                            <i className="bx bx-package text-4xl text-slate-300" />
                            <p className="mt-2 text-sm font-bold">No delivery logs match this search.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] dark:border-zinc-800 dark:bg-zinc-900">
                {selectedDelivery && selectedDeliveryMeta ? (
                  <div className="flex h-full flex-col">
                    <div className="border-b border-slate-100 p-5 dark:border-zinc-800">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Selected Delivery</p>
                          <h3 className="mt-1 truncate text-xl font-black tracking-tight text-slate-900 dark:text-zinc-50" title={selectedDelivery.siteName}>
                            {selectedDelivery.siteName}
                          </h3>
                          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-zinc-400">
                            #{selectedDelivery.reference} · Token {selectedDelivery.trackingToken}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${selectedDeliveryMeta.pill}`}>
                          {selectedDeliveryMeta.label}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4 p-5">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                          <span>{MOVEMENT_META[selectedDelivery.movementType].label}</span>
                          <span className="max-w-[150px] truncate text-right">{selectedDelivery.toWarehouseName || selectedDelivery.siteName}</span>
                        </div>
                        <div className="relative mt-7 h-2 rounded-full bg-slate-200 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-500 transition-all duration-700"
                            style={{ width: `${selectedDeliveryProgress}%` }}
                          />
                          <div
                            className={`absolute -top-3 flex h-8 w-8 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.65)] transition-all duration-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 ${selectedDelivery.status === 'dispatched' ? 'animate-bounce' : ''}`}
                            style={{ left: `calc(${selectedDeliveryMarker}% - 16px)` }}
                          >
                            <i className={`bx ${selectedDeliveryMeta.icon} text-lg`} />
                          </div>
                        </div>
                        <div className="mt-8 flex items-start justify-between gap-3 text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                          <span>Staging</span>
                          <span className="text-center">{DELIVERY_LOCATION[selectedDelivery.status]}</span>
                          <span className="text-right">Receipt</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-200 p-3 dark:border-zinc-800">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dispatch Date</p>
                          <p className="mt-1 text-sm font-black text-slate-800 dark:text-zinc-100">{formatDeliveryDate(selectedDelivery.date)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 p-3 dark:border-zinc-800">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Loaded Units</p>
                          <p className="mt-1 text-sm font-black text-slate-800 dark:text-zinc-100">{selectedDeliveryUnits}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white dark:bg-zinc-100 dark:text-zinc-950">
                            {selectedDelivery.subconName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Assigned Team</p>
                            <h4 className="truncate text-sm font-black text-slate-800 dark:text-zinc-100" title={selectedDelivery.subconName}>{selectedDelivery.subconName}</h4>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-[11px] dark:border-zinc-800">
                          <div>
                            <span className="block font-black uppercase tracking-wider text-slate-400">From</span>
                            <span className="font-bold text-slate-700 dark:text-zinc-300">{selectedDelivery.fromWarehouseName || selectedWarehouse?.warehouseName || 'Warehouse stock'}</span>
                          </div>
                          <div>
                            <span className="block font-black uppercase tracking-wider text-slate-400">To</span>
                            <span className="font-bold text-slate-700 dark:text-zinc-300">{selectedDelivery.toWarehouseName || selectedDelivery.siteName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Tracker Status
                        </label>
                        <select
                          value={selectedDelivery.status}
                          onChange={e => handleUpdateDeliveryStatus(selectedDelivery.id, e.target.value as DeliveryStatus)}
                          className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none transition focus:border-green-400 focus:ring-4 focus:ring-green-400/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                        >
                          <option value="pending">Pending dispatch clearance</option>
                          <option value="dispatched">Dispatched active transit</option>
                          <option value="delivered">Delivered and received</option>
                        </select>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Milestones</p>
                        {[
                          { label: 'Queue accepted', detail: 'Delivery request entered in the warehouse release queue.', active: true },
                          { label: 'Gate release', detail: 'Cargo loaded and released from the logistics gate.', active: selectedDelivery.status !== 'pending' },
                          { label: 'Active transit', detail: 'Courier team is moving toward the destination site.', active: selectedDelivery.status !== 'pending' },
                          { label: 'Site receipt', detail: 'Materials received and verified by site engineer.', active: selectedDelivery.status === 'delivered' },
                        ].map(step => (
                          <div key={step.label} className="flex gap-3">
                            <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${step.active ? 'bg-green-600 ring-green-500/15' : 'bg-slate-300 ring-transparent dark:bg-zinc-700'}`} />
                            <div>
                              <p className={`text-xs font-black ${step.active ? 'text-slate-800 dark:text-zinc-100' : 'text-slate-400'}`}>{step.label}</p>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-400">{step.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center p-6 text-center">
                    <div>
                      <i className="bx bx-trip text-4xl text-slate-300" />
                      <p className="mt-3 text-sm font-black text-slate-700 dark:text-zinc-200">No delivery selected</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">Select a dispatch to view route and status details.</p>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </div>
        )}

        {/* Modal: Receive Materials (Check-in) */}
        {receiveModal && (
          <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-950">
              <div className="shrink-0 bg-gradient-to-r from-green-950 via-emerald-900 to-green-800 px-6 py-5 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                      <i className="bx bx-plus-circle text-lg text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-black">Receive Stock Materials</p>
                      <p className="mt-0.5 text-xs text-green-100">Increment inventory levels</p>
                    </div>
                  </div>
                  <button onClick={() => setReceiveModal(false)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25">
                    <i className="bx bx-x text-lg" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleReceiveStock} className="flex-1 space-y-4 overflow-y-auto p-6">
                <div>
                  <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Select Material Item</label>
                  <select
                    required
                    value={receiveForm.itemId}
                    onChange={e => setReceiveForm(f => ({ ...f, itemId: e.target.value }))}
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-green-400 focus:ring-4 focus:ring-green-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  >
                    <option value="">-- Choose Material --</option>
                    {stockOptions.map(s => <option key={s.id} value={s.id}>{s.name} (Current: {s.qty} {s.unit})</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Receipt Quantity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Enter quantity to add..."
                    value={receiveForm.qty}
                    onChange={e => setReceiveForm(f => ({ ...f, qty: e.target.value }))}
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-green-400 focus:ring-4 focus:ring-green-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Storage Bay Location (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Rack A-3, Yard Sec B..."
                    value={receiveForm.location}
                    onChange={e => setReceiveForm(f => ({ ...f, location: e.target.value }))}
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-green-400 focus:ring-4 focus:ring-green-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setReceiveModal(false)} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="flex-1 rounded-2xl bg-green-600 py-2.5 text-sm font-black text-white hover:bg-green-700 transition disabled:opacity-50">
                    {saving ? 'Saving...' : 'Add Materials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Dispatch Materials (Decrements Stock & schedules delivery) */}
        {dispatchModal && (
          <div className="fixed inset-0 z-9990 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-950">
              <div className="shrink-0 bg-gradient-to-r from-emerald-950 to-emerald-800 px-6 py-5 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                      <i className="bx bx-send text-lg text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-black">Request Stock Movement</p>
                      <p className="mt-0.5 text-xs text-emerald-200">Delivery, pull-out, or warehouse transfer</p>
                    </div>
                  </div>
                  <button onClick={() => setDispatchModal(false)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white transition hover:bg-white/25">
                    <i className="bx bx-x text-lg" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleDispatch} className="flex-1 space-y-4 overflow-y-auto p-6">
                <div>
                  <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Movement Type</label>
                  <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-zinc-900">
                    {(Object.keys(MOVEMENT_META) as MovementType[]).map(type => {
                      const meta = MOVEMENT_META[type]
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setDispatchForm(f => ({ ...f, movementType: type }))}
                          className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[11px] font-black transition ${dispatchForm.movementType === type ? 'bg-white text-emerald-700 shadow-sm dark:bg-zinc-800 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                        >
                          <i className={`bx ${meta.icon} text-sm`} />
                          {meta.noun}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {dispatchForm.movementType === 'transfer' ? (
                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Destination Warehouse</label>
                    <select
                      required
                      value={dispatchForm.toWarehouseId}
                      onChange={e => setDispatchForm(f => ({ ...f, toWarehouseId: e.target.value }))}
                      className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    >
                      <option value="">-- Choose destination warehouse --</option>
                      {warehouseSites
                        .filter(warehouse => warehouse.dbId !== undefined && (!selectedWarehouse?.dbId || warehouse.dbId !== selectedWarehouse.dbId))
                        .map(warehouse => <option key={warehouse.id} value={String(warehouse.dbId)}>{warehouse.warehouseName} · {warehouse.subconName}</option>)}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">
                        {dispatchForm.movementType === 'pullout' ? 'Pull-out Destination / Receiver' : 'Destination Project Site'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={dispatchForm.movementType === 'pullout' ? 'e.g. Main warehouse return bay...' : 'e.g. Manila Central Site A...'}
                        value={dispatchForm.siteName}
                        onChange={e => setDispatchForm(f => ({ ...f, siteName: e.target.value }))}
                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Assigned Subcontractor</label>
                      <input
                        type="text"
                        required={dispatchForm.movementType === 'delivery'}
                        placeholder="e.g. CoreTech Inc..."
                        value={dispatchForm.subconName}
                        onChange={e => setDispatchForm(f => ({ ...f, subconName: e.target.value }))}
                        className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Stock Material Item</label>
                  <select
                    required
                    value={dispatchForm.itemId}
                    onChange={e => setDispatchForm(f => ({ ...f, itemId: e.target.value }))}
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  >
                    <option value="">-- Choose Material --</option>
                    {stockOptions.map(s => <option key={s.id} value={s.id}>{s.name} (Avail: {s.qty} {s.unit})</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Request Quantity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Enter quantity to dispatch..."
                    value={dispatchForm.qty}
                    onChange={e => setDispatchForm(f => ({ ...f, qty: e.target.value }))}
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black text-slate-500 uppercase tracking-wider">Reason / Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Reason, chain reference, or receiver details..."
                    value={dispatchForm.reason}
                    onChange={e => setDispatchForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setDispatchModal(false)} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-black text-white hover:bg-emerald-700 transition disabled:opacity-50">
                    {saving ? 'Processing...' : `Create ${MOVEMENT_META[dispatchForm.movementType].noun}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
