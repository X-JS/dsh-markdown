export interface Config {
  vaultPath: string | null;
  aiBaseUrl: string;
  aiModel: string;
  aiVisionModel: string;
  aiApiKey: string;
  theme: "auto" | "light" | "dark";
}

export type ViewMode = "edit" | "split" | "preview" | "mindmap" | "graph";

export interface OutlineHeading {
  level: number;
  text: string;
  line: number;
}
