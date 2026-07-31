// app/api/filters/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fileFilterStore } from "@/app/_lib/views-filters/file-store";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  const filters = await fileFilterStore.list(projectId);
  return NextResponse.json(filters);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { projectId, label, criteria, description } = body ?? {};
  if (!projectId || !label || !criteria) {
    return NextResponse.json(
      { error: "projectId, label, and criteria are required" },
      { status: 400 }
    );
  }
  // "anonymous" placeholder — no auth/session exists yet (project summary §8).
  const created = await fileFilterStore.create(
    projectId,
    label,
    criteria,
    "anonymous",
    description
  );
  return NextResponse.json(created, { status: 201 });
}
