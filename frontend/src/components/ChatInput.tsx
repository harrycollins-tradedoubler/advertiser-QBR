import { useState, type FormEvent } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [message, setMessage] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSend(message.trim())
      setMessage('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[1100px] w-full mx-auto flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder || 'Type your message...'}
        disabled={disabled}
        className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2A73FF] focus:border-transparent disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !message.trim()}
        className="px-5 py-2.5 bg-[#2A73FF] text-white text-sm font-medium rounded-xl hover:bg-[#1F5ED8] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
      >
        Send
      </button>
    </form>
  )
}
