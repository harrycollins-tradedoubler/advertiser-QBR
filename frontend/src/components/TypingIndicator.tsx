export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[700px] w-full flex justify-start">
        <div className="px-4 py-3 rounded-[14px] bg-white border border-gray-200">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#2A73FF] pulse-dot" />
            <div className="w-2 h-2 rounded-full bg-[#2A73FF] pulse-dot" />
            <div className="w-2 h-2 rounded-full bg-[#2A73FF] pulse-dot" />
          </div>
        </div>
      </div>
    </div>
  )
}
