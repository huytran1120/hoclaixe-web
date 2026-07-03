import type { Metadata } from "next";
import "./globals.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const iconPath = `${BASE_PATH}/favicon.svg`;

export const metadata: Metadata = {
  title: "Ôn tập 600 câu hỏi lái xe",
  description: "Ôn tập và thi thử 600 câu hỏi sát hạch lái xe cơ giới đường bộ.",
  icons: {
    icon: iconPath,
    shortcut: iconPath,
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
