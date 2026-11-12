"use client";

import { useParams } from "next/navigation";
import { ForestForm } from "@/components/forests";

export default function EditForestPage() {
  const params = useParams<{ id: string }>();
  return <ForestForm forestId={params.id} />;
}
