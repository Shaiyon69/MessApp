import React, { useState, useEffect } from 'react'
import { Paperclip, X, FileText, Image, Video, Music, Archive, Download } from 'lucide-react'
import toast from 'react-hot-toast'

export default function FileUploader({ 
  onFileUpload, 
  maxSize = 10 * 1024 * 1024, // 10MB
  allowedTypes = ['image/*', 'video/*', 'audio/*', 'application/pdf', '.doc,.docx,.txt,.zip,.rar'],
  multiple = false 
}) {
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState([])

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return <Image size={20} />
    if (type.startsWith('video/')) return <Video size={20} />
    if (type.startsWith('audio/')) return <Music size={20} />
    if (type.includes('pdf') || type.includes('document') || type.includes('text')) return <FileText size={20} />
    return <Archive size={20} />
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const validateFile = (file) => {
    // Check file size
    if (file.size > maxSize) {
      toast.error(`File ${file.name} is too large (max ${formatFileSize(maxSize)})`)
      return false
    }

    // Check file type (basic validation)
    const isAllowed = allowedTypes.some(type => {
      if (type.startsWith('.')) {
        // Extension check
        return file.name.toLowerCase().endsWith(type.toLowerCase())
      } else {
        // MIME type check
        return file.type.match(type.replace('*', '.*'))
      }
    })

    if (!isAllowed) {
      toast.error(`File type ${file.type} is not allowed`)
      return false
    }

    return true
  }

  const handleFiles = (files) => {
    const validFiles = Array.from(files).filter(validateFile)
    
    if (multiple) {
      setSelectedFiles(prev => [...prev, ...validFiles])
    } else {
      setSelectedFiles(validFiles.slice(0, 1))
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files)
    }
  }

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return

    setUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        setUploadProgress((i / selectedFiles.length) * 100)
        
        await onFileUpload(file)
      }
      
      setUploadProgress(100)
      setSelectedFiles([])
      toast.success(`Uploaded ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`)
      
    } catch (error) {
      console.error('Upload failed:', error)
      toast.error('Failed to upload files')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          dragActive
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-[var(--border-subtle)] bg-[var(--bg-element)] hover:bg-[var(--bg-surface)]'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple={multiple}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          accept={allowedTypes.join(',')}
        />
        
        <div className="flex flex-col items-center gap-3">
          <Paperclip size={48} className="text-[var(--text-muted)]" />
          <div>
            <p className="text-[var(--text-main)] font-medium">
              {dragActive ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              or click to browse
            </p>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            <p>Max size: {formatFileSize(maxSize)}</p>
            <p>Allowed: {allowedTypes.join(', ')}</p>
          </div>
        </div>
      </div>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-[var(--text-main)]">
              Selected Files ({selectedFiles.length})
            </h4>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          </div>
          
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-[var(--bg-element)] rounded-lg border border-[var(--border-subtle)]"
            >
              <div className="text-[var(--text-muted)]">
                {getFileIcon(file.type)}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-main)] truncate">
                  {file.name}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {formatFileSize(file.size)}
                </p>
              </div>
              
              <button
                onClick={() => removeFile(index)}
                className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-main)]">Uploading...</span>
            <span className="text-[var(--text-secondary]">{Math.round(uploadProgress)}%</span>
          </div>
          <div className="w-full bg-[var(--bg-base)] rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload Button */}
      {selectedFiles.length > 0 && !uploading && (
        <button
          onClick={uploadFiles}
          className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors cursor-pointer"
        >
          Upload {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

export function FilePreview({ file, onRemove, showDownload = false }) {
  const [preview, setPreview] = useState(null)

  const generatePreview = async () => {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreview({ type: 'image', url })
    } else if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file)
      setPreview({ type: 'video', url })
    } else if (file.type.startsWith('audio/')) {
      const url = URL.createObjectURL(file)
      setPreview({ type: 'audio', url })
    } else {
      // For documents, show file info
      setPreview({ type: 'document', file })
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  useEffect(() => {
    generatePreview()
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url)
      }
    }
  }, [file])

  if (!preview) return null

  return (
    <div className="relative group">
      <div className="bg-[var(--bg-element)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
        {preview.type === 'image' && (
          <img
            src={preview.url}
            alt={file.name}
            className="w-full h-32 object-cover"
          />
        )}
        
        {preview.type === 'video' && (
          <video className="w-full h-32 object-cover">
            <source src={preview.url} type={file.type} />
          </video>
        )}
        
        {preview.type === 'audio' && (
          <div className="w-full h-32 flex items-center justify-center bg-[var(--bg-base)]">
            <audio controls className="w-full px-2">
              <source src={preview.url} type={file.type} />
            </audio>
          </div>
        )}
        
        {preview.type === 'document' && (
          <div className="w-full h-32 flex flex-col items-center justify-center bg-[var(--bg-base)] p-4">
            <FileText size={32} className="text-[var(--text-muted)] mb-2" />
            <p className="text-xs text-[var(--text-secondary)] text-center truncate w-full">
              {file.name}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {formatFileSize(file.size)}
            </p>
          </div>
        )}
      </div>

      {/* Overlay Actions */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        {showDownload && (
          <button
            onClick={() => {
              const url = URL.createObjectURL(file)
              const a = document.createElement('a')
              a.href = url
              a.download = file.name
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="p-2 bg-white/20 backdrop-blur-sm rounded-lg text-white hover:bg-white/30 transition-colors cursor-pointer"
          >
            <Download size={16} />
          </button>
        )}
        
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-2 bg-red-500/80 backdrop-blur-sm rounded-lg text-white hover:bg-red-600 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
