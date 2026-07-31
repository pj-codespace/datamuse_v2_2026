import { notFound } from "next/navigation";
import { getNetworkData } from "@/app/_lib/data/network-data";
import { PROJECT_REGISTRY } from "@/app/_lib/data/projects";
import NetworkWorkspace from "@/app/_components/layout/NetworkWorkspace";

interface NetworkProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function NetworkProjectPage({ params }: NetworkProjectPageProps) {
  const { projectId } = await params;

  const isRegistered = PROJECT_REGISTRY.some((p) => p.id === projectId);
  if (!isRegistered) {
    notFound();
  }

  const data = await getNetworkData(projectId);

  return <NetworkWorkspace data={data} projectId={projectId} />;
}
