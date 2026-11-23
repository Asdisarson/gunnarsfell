// Site-wide facts used by the layout and the SEO fallbacks.

export const MENU = [
  { id: 25, pageId: 6, label: 'Gunnarsfell', href: '/' },
  { id: 20, pageId: 1048, label: 'Um okkur', href: '/um-okkur/' },
  { id: 23, pageId: 1049, label: 'Þjónusta', href: '/thjonusta/' },
  { id: 10218, pageId: 10210, label: 'Umsagnir', href: '/umsagnir/' },
  { id: 22, pageId: 15, label: 'Unnin verk', href: '/unnin-verk/' },
  { id: 21, pageId: 1050, label: 'Hafa samband', href: '/hafa-samband/' },
] as const;

export const LOGO = {
  url: '/wp-content/uploads/2023/09/gunnarsfell-logo.png',
  width: 749,
  height: 391,
  type: 'image/png',
};

export const COMPANY = {
  name: 'Gunnarsfell ehf',
  address: 'Mörkin 1, 108 Reykjavík',
  kennitala: '451207 - 0160',
  email: 'gunnarsfell@gunnarsfell.is',
  phone: '+(354) 546-4466',
  facebook: 'https://www.facebook.com/Gunnarsfell',
};

/** Descriptions for URLs where Yoast has none. Anything written in Yoast wins over these. */
export const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  '/unnin-verk/': 'Myndir af verkum sem Gunnarsfell hefur unnið: baðherbergi, sólpallar, parketlögn og fleira.',
};

export const projectDescription = (title: string, description: string) =>
  description.trim() || `${title} – myndir af verki sem Gunnarsfell ehf vann.`;
