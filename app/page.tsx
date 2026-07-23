import Link from "next/link";
import { getProjectSummaries } from "@/app/_lib/data/network-data";

export default async function HomePage() {
  const projects = await getProjectSummaries();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Projects</h1>
      <p className="mb-8 text-sm text-gray-500">
        Select a project to open its network visualization.
      </p>

      <div className="flex flex-col gap-4">
        {projects.map((project) => {
          const card = (
            <>
              <h2 className="text-lg font-medium text-gray-900">{project.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{project.description}</p>
              <dl className="mt-3 flex gap-6 text-xs text-gray-400">
                <div>
                  <dt className="inline font-medium text-gray-500">Actors: </dt>
                  <dd className="inline">{project.nodeCount}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-gray-500">Links: </dt>
                  <dd className="inline">{project.linkCount}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-gray-500">Categories: </dt>
                  <dd className="inline">{project.categoryCount}</dd>
                </div>
              </dl>
            </>
          );

          // Projects whose data file hasn't been uploaded yet render as a
          // disabled-looking card instead of a broken link.
          if (!project.available) {
            return (
              <div
                key={project.id}
                className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-5 opacity-60"
              >
                {card}
              </div>
            );
          }

          return (
            <Link
              key={project.id}
              href={`/network/${project.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              {card}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
