export interface ToolDefinition {
  id: string;
  label: string;
  /** Short text shown on the dock button until real icons are added
   *  (e.g. via lucide-react, not currently installed in this project). */
  shortLabel: string;
}

// Placeholders per the brief. Add/remove freely — nothing else needs to
// change, since ToolDock and ToolSidePanel both just map over this list.
export const TOOLS: ToolDefinition[] = [
  { id: "add-actor", label: "Add Actor", shortLabel: "A+" },
  { id: "edit-actor", label: "Edit Actor", shortLabel: "Ae" },
  { id: "delete-actor", label: "Delete Actor", shortLabel: "A-" },
  { id: "link", label: "Link", shortLabel: "Lk" },
  { id: "filter", label: "Filter", shortLabel: "Fl" },
];
