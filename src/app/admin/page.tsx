import type { Metadata } from "next";
import AdminOrdersClient from "./AdminOrdersClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관리자 주문 조회 | Korea Resume AI",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminOrdersClient />;
}
