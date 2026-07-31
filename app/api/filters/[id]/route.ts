// app/api/filters/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fileFilterStore } from "@/app/_lib/views-filters/file-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const filter = await fileFilterStore.get(id);
  if (!filter) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(filter);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Two distinct operations sharing one route, per the CRUD scope agreed
  // earlier: editing criteria mints a new FilterValue + history entry;
  // renaming mutates label/description in place with no new history.
  if (body.criteria) {
    const updated = await fileFilterStore.updateCriteria(id, body.criteria, "anonymous");
    return NextResponse.json(updated);
  }

  const renamed = await fileFilterStore.rename(id, body.label, body.description);
  return NextResponse.json(renamed);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await fileFilterStore.softDelete(id);
  return NextResponse.json({ ok: true });
}
