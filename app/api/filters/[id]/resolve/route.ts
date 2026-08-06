// app/api/filters/[id]/resolve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { postgresFilterStore } from "@/app/_lib/views-filters/postgres-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const criteria = await postgresFilterStore.resolve({
    mode: "track",
    namedFilterId: id,
  });
  if (!criteria) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(criteria);
}
