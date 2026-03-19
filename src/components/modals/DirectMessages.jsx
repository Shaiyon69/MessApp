import { useEffect } from 'react'

export default function DirectMessages({ onClose }) {
  useEffect(() => {
    return () => {
      // cleanup if needed
    }
  }, [])

  return (
    <div className="p-4 bg-slate-900 text-white rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold">Direct Messages</h3>
        <button onClick={onClose} className="text-gray-300 hover:text-white">Close</button>
      </div>
      <p className="text-sm text-gray-300">This modal is not currently implemented.</p>
    </div>
  )
}

