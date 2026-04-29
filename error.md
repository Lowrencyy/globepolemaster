[plugin:vite:oxc] Transform failed with 1 error:

[PARSE_ERROR] Error: Logical expressions and coalesce expressions cannot be mixed
     ╭─[ src/pages/subcontractors/TeamDetail.tsx:219:24 ]
     │
 219 │ ╭─▶       const fullName = body.user?.full_name
     ┆ ┆   
 221 │ ├─▶         || `${form.first_name} ${form.last_name}`
     │ │                                                       
     │ ╰─────────────────────────────────────────────────────── 
     │ 
     │ Help: Wrap either expression by parentheses
─────╯
C:/globe-app/globe-app/src/pages/subcontractors/TeamDetail.tsx
    at transformWithOxc (file:///C:/globe-app/globe-app/node_modules/vite/dist/node/chunks/node.js:3745:19)
    at TransformPluginContext.transform (file:///C:/globe-app/globe-app/node_modules/vite/dist/node/chunks/node.js:3813:26)
    at EnvironmentPluginContainer.transform (file:///C:/globe-app/globe-app/node_modules/vite/dist/node/chunks/node.js:30143:51)
    at async loadAndTransform (file:///C:/globe-app/globe-app/node_modules/vite/dist/node/chunks/node.js:24468:26)
    at async viteTransformMiddleware (file:///C:/globe-app/globe-app/node_modules/vite/dist/node/chunks/node.js:24262:20)
Click outside, press Esc key, or fix the code to dismiss.
You can also disable this overlay by setting server.hmr.overlay to false in vite.config.ts.