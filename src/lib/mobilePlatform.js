/** Returns true only when the native Keyboard bridge can handle resize calls. */
export const shouldConfigureNativeKeyboard = (capacitor) => Boolean(
  capacitor?.isNativePlatform?.() && capacitor?.isPluginAvailable?.('Keyboard')
)
