import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ôn tập 600 câu hỏi lái xe",
  description: "Ôn tập và thi thử 600 câu hỏi sát hạch lái xe cơ giới đường bộ.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
