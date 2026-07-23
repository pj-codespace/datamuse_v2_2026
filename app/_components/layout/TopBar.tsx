import Link from "next/link";

interface TopBarProps {
  projectName: string;
  /** Placeholder nav items for now — replace with real routes/links later. */
  menuItems?: string[];
}

const DEFAULT_MENU_ITEMS = ["Overview", "Reports", "Settings", "Help"];

// No "use client" here on purpose: this bar is static (no state, no
// handlers yet), so it can stay a Server Component. If a menu item later
// needs interactivity (a dropdown, an active-route highlight), only that
// piece needs to become a small Client Component — not this whole bar.
export default function TopBar({
  projectName,
  menuItems = DEFAULT_MENU_ITEMS,
}: TopBarProps) {
  return (
    <header className="flex h-20 w-full items-center justify-between border-b border-gray-200 bg-white px-6">
      <Link href="/" className="text-lg font-semibold text-gray-900 hover:text-gray-700">
        {projectName}
      </Link>
      <nav className="flex items-center gap-6">
        {menuItems.map((item) => (
          <button
            key={item}
            type="button"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            {item}
          </button>
        ))}
      </nav>
    </header>
  );
}
