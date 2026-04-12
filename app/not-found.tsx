import type { Metadata } from "next";
import NotFoundClient from "./not-found-client";

export const metadata: Metadata = {
  title: "404 • Van Tanija BV Cleaning",
};

export default function NotFound() {
  return <NotFoundClient />;
}
