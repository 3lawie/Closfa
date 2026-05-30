import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Closfa',
  description: 'Closfa social platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body id="root">{children}</body>
    </html>
  )
}
