import { useState, useRef, useEffect } from 'react'

interface Message {
  id: number
  text: string
  from: 'user' | 'bot'
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: 'Hi! How can I help you today?', from: 'bot' },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const text = input.trim()
    if (!text) return
    setMessages(prev => [...prev, { id: Date.now(), text, from: 'user' }])
    setInput('')
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, text: "I'll look into that for you!", from: 'bot' },
      ])
    }, 800)
  }

  return (
    <div className="fixed z-40 flex flex-col items-end gap-3 ltr:right-5 rtl:left-5 bottom-10">
      {/* Chat popup — shown above the button */}
      {open && (
        <div className="w-72 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-zinc-600 bg-white dark:bg-zinc-800 animate-none">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-violet-500">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-300"></div>
              <span className="text-white text-sm font-medium">AI Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-xl leading-none">&times;</button>
          </div>

          {/* Messages */}
          <div className="h-56 overflow-y-auto p-3 flex flex-col gap-2">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <span className={`text-xs px-3 py-2 rounded-2xl max-w-[80%] leading-relaxed ${
                  msg.from === 'user'
                    ? 'bg-violet-500 text-white rounded-br-none'
                    : 'bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-bl-none'
                }`}>
                  {msg.text}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center border-t border-gray-100 dark:border-zinc-600">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Type a message..."
              className="flex-1 text-xs px-3 py-3 bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
            />
            <button onClick={send} className="px-3 py-2 text-violet-500 hover:text-violet-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bouncing chat button — same style as RTL button */}
      <div className={open ? '' : 'animate-bounce'}>
        <button
          onClick={() => setOpen(o => !o)}
          className="px-3.5 py-4 z-40 text-14 transition-all duration-300 ease-linear text-white bg-violet-500 hover:bg-violet-600 rounded-full font-medium flex items-center justify-center"
        >
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
