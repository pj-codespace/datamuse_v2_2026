// app/api/filters/[id]/resolve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fileFilterStore } from "@/app/_lib/views-filters/file-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const criteria = await fileFilterStore.resolve({
    mode: "track",
    namedFilterId: id,
  });
  if (!criteria) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(criteria);
}
