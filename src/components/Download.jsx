/** Public download page: links the native builds published by release.yml. */
import { ArrowLeft, Download as DownloadIcon, ExternalLink, Monitor, Smartphone, Terminal } from 'lucide-react'
import { version } from '../../package.json'

// Builds ship only as Skibidevs releases, tagged messapp-v<version>.
const RELEASE = `https://github.com/Shaiyon69/Skibidevs/releases/download/messapp-v${version}`
const ALL_RELEASES = 'https://shaiyon69.github.io/Skibidevs/apptic/?app=messapp'

const PLATFORMS = [
  { id: 'windows', name: 'Windows', icon: Monitor, files: [{ label: 'Installer (.exe)', file: `MessApp-Windows-v${version}.exe` }] },
  { id: 'linux', name: 'Linux', icon: Terminal, files: [
    { label: 'AppImage', file: `MessApp-Linux-v${version}.AppImage` },
    { label: 'Debian (.deb)', file: `MessApp-Linux-v${version}.deb` },
  ] },
  { id: 'android', name: 'Android', icon: Smartphone, files: [{ label: 'APK', file: `MessApp-Android-v${version}.apk` }] },
]

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const detected = /android/i.test(ua) ? 'android' : /windows/i.test(ua) ? 'windows' : /linux/i.test(ua) ? 'linux' : null

export default function Download({ onBack }) {
  return (
    <div className="ios-sheet auth-card rounded-3xl w-full md:h-[560px] max-w-4xl flex flex-col md:flex-row relative md:overflow-hidden text-[var(--text-main)]">
      <div className="w-full md:w-1/2 p-8 md:p-10 lg:p-14 flex flex-col justify-center md:justify-between border-b md:border-b-0 md:border-r border-[var(--border-subtle)] relative shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-6 md:mb-16 mt-4 md:mt-0">
            <div className="messapp-auth-logo flex h-10 w-10 items-center justify-center rounded-xl" aria-hidden="true">
              <img src="/messapp-mark.svg" alt="" className="h-9 w-9" />
            </div>
            <span className="font-bold tracking-wider type-label">MESSAPP</span>
          </div>
          <h1 className="gradient-text type-display font-semibold tracking-tight mb-2 md:mb-6 leading-[1.1]">
            Take it<br className="hidden md:block"/><span className="md:hidden"> </span><span className="accent-gradient-text">anywhere.</span>
          </h1>
          <p className="hidden md:block text-[var(--text-muted)] type-title max-w-sm mt-4 leading-relaxed font-sans">
            The same MessApp on your desktop and phone. Or keep using it right here in the browser.
          </p>
        </div>
        <div className="hidden md:flex gap-6 mt-16 md:mt-0 pt-8 type-meta font-bold text-[var(--text-muted)] uppercase tracking-widest">
          <span>v{version}-BETA</span><span className="w-8 h-[1px] bg-[var(--border-hover)] my-auto"></span><span>MESSAPP</span>
        </div>
      </div>

      <div className="w-full md:w-1/2 p-6 md:p-8 lg:p-10 flex flex-col justify-center bg-[var(--bg-base)] flex-1 md:overflow-y-auto custom-scrollbar">
        <div className="max-w-md w-full mx-auto my-auto md:my-0 pb-6 md:pb-0 pt-2 md:pt-0">
          <h2 className="type-view-title font-semibold tracking-tight mb-2">Download</h2>
          <p className="text-[var(--text-muted)] type-label mb-6">Version {version} beta. iOS is not available yet.</p>

          <div className="flex flex-col gap-3">
            {PLATFORMS.map(({ id, name, icon: Icon, files }) => (
              <div key={id} className={`ghost-border rounded-xl p-4 ${id === detected ? 'border-[var(--app-accent)]' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <Icon size={18} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                  <span className="type-label font-semibold">{name}</span>
                  {id === detected && <span className="ml-auto type-meta font-bold uppercase tracking-widest text-[var(--app-accent)]">Your device</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {files.map(({ label, file }) => (
                    <a key={file} href={`${RELEASE}/${file}`} className={`${id === detected ? 'premium-button' : 'premium-secondary-button'} h-10 px-4 font-bold type-meta flex items-center gap-2`}>
                      <DownloadIcon size={15} aria-hidden="true" /> {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <a href={ALL_RELEASES} target="_blank" rel="noreferrer" className="mt-4 type-meta text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center justify-center gap-1.5">
            All releases <ExternalLink size={13} aria-hidden="true" />
          </a>

          <button onClick={onBack} type="button" className="premium-secondary-button mt-5 w-full h-12 font-bold cursor-pointer type-label flex items-center justify-center gap-2">
            <ArrowLeft size={16} aria-hidden="true" /> Open in Browser
          </button>
        </div>
      </div>
    </div>
  )
}
