import type { ReactNode } from "react";

export const metadata = { title: "Holdline", description: "Plain-English PBS bids" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
