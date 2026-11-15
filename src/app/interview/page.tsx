import type { Metadata } from "next";
import InterviewClient from "./InterviewClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/interview",
  },
};

export default function InterviewPage() {
  return <InterviewClient />;
}
