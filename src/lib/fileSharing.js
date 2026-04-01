// File sharing service for handling various file types
class FileSharingService {
  constructor() {
    this.supportedTypes = {
      images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      documents: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
      spreadsheets: ['xls', 'xlsx', 'csv'],
      presentations: ['ppt', 'pptx'],
      archives: ['zip', 'rar', '7z', 'tar', 'gz'],
      audio: ['mp3', 'wav', 'ogg', 'aac', 'flac'],
      video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'],
      code: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c'],
      other: []
    }
    
    this.maxFileSize = 50 * 1024 * 1024 // 50MB
    this.maxImageSize = 10 * 1024 * 1024 // 10MB for images
  }

  // Get file category from extension
  getFileCategory(filename) {
    const ext = filename.split('.').pop()?.toLowerCase()
    
    for (const [category, extensions] of Object.entries(this.supportedTypes)) {
      if (extensions.includes(ext)) {
        return category
      }
    }
    
    return 'other'
  }

  // Get file icon based on type
  getFileIcon(category, filename) {
    const iconMap = {
      images: '🖼️',
      documents: '📄',
      spreadsheets: '📊',
      presentations: '📽️',
      archives: '📦',
      audio: '🎵',
      video: '🎬',
      code: '💻',
      other: '📎'
    }
    
    return iconMap[category] || iconMap.other
  }

  // Validate file before upload
  validateFile(file) {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new Error(`File size exceeds maximum limit of ${this.formatFileSize(this.maxFileSize)}`)
    }
    
    // Check image size separately
    const category = this.getFileCategory(file.name)
    if (category === 'images' && file.size > this.maxImageSize) {
      throw new Error(`Image size exceeds maximum limit of ${this.formatFileSize(this.maxImageSize)}`)
    }
    
    return true
  }

  // Format file size for display
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Get file preview URL
  async getPreviewUrl(file) {
    const category = this.getFileCategory(file.name)
    
    if (category === 'images') {
      return URL.createObjectURL(file)
    }
    
    // For other file types, you could generate thumbnails
    return null
  }

  // Compress image if needed
  async compressImage(file) {
    const category = this.getFileCategory(file.name)
    
    if (category !== 'images') {
      return file
    }
    
    // If image is already small enough, return as-is
    if (file.size <= this.maxImageSize) {
      return file
    }
    
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      img.onload = () => {
        // Calculate new dimensions
        const maxWidth = 1920
        const maxHeight = 1080
        let width = img.width
        let height = img.height
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width *= ratio
          height *= ratio
        }
        
        canvas.width = width
        canvas.height = height
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: file.type }))
        }, file.type, 0.8)
      }
      
      img.src = URL.createObjectURL(file)
    })
  }

  // Generate file metadata
  generateMetadata(file) {
    const category = this.getFileCategory(file.name)
    const icon = this.getFileIcon(category, file.name)
    
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      category,
      icon,
      formattedSize: this.formatFileSize(file.size),
      extension: file.name.split('.').pop()?.toLowerCase(),
      lastModified: new Date(file.lastModified)
    }
  }

  // Upload file to storage
  async uploadFile(file, onProgress) {
    this.validateFile(file)
    
    // Compress image if needed
    const processedFile = await this.compressImage(file)
    
    // Generate unique filename
    const fileName = `${Date.now()}_${processedFile.name}`
    const filePath = `uploads/${fileName}`
    
    // Create form data for upload
    const formData = new FormData()
    formData.append('file', processedFile)
    formData.append('path', filePath)
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('Upload failed')
      }
      
      const result = await response.json()
      
      return {
        url: result.url,
        path: filePath,
        metadata: this.generateMetadata(processedFile)
      }
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`)
    }
  }

  // Download file from URL
  async downloadFile(url, filename) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      throw new Error(`Download failed: ${error.message}`)
    }
  }

  // Preview file in browser
  previewFile(url, metadata) {
    const { category, name } = metadata
    
    if (category === 'images') {
      // Open image in new tab
      window.open(url, '_blank')
    } else if (category === 'documents' && metadata.extension === 'pdf') {
      // Open PDF in new tab
      window.open(url, '_blank')
    } else if (category === 'audio' || category === 'video') {
      // Open media in new tab
      window.open(url, '_blank')
    } else {
      // Download other files
      this.downloadFile(url, name)
    }
  }

  // Check if file type is supported
  isSupported(filename) {
    const category = this.getFileCategory(filename)
    return category !== 'other'
  }

  // Get file type restrictions
  getRestrictions() {
    return {
      maxFileSize: this.maxFileSize,
      maxImageSize: this.maxImageSize,
      supportedTypes: Object.keys(this.supportedTypes),
      supportedExtensions: Object.values(this.supportedTypes).flat()
    }
  }
}

// Export singleton instance
export const fileSharing = new FileSharingService()

// Export convenience functions
export const uploadFile = (file, onProgress) => fileSharing.uploadFile(file, onProgress)
export const downloadFile = (url, filename) => fileSharing.downloadFile(url, filename)
export const previewFile = (url, metadata) => fileSharing.previewFile(url, metadata)
export const validateFile = (file) => fileSharing.validateFile(file)
export const getFileMetadata = (file) => fileSharing.generateMetadata(file)
export const isFileSupported = (filename) => fileSharing.isSupported(filename)
