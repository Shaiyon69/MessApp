import EmojiPicker from 'emoji-picker-react'

const getTheme = () =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'

export default function ChatEmojiPicker(props) {
  return (
    <EmojiPicker
      theme={getTheme()}
      emojiStyle="native"
      lazyLoadEmojis={true}
      autoFocusSearch={false}
      previewConfig={{ showPreview: false }}
      {...props}
    />
  )
}
