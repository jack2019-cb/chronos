import React from "react";

// Template option type for theme, font, background
export type CustomizationTemplate = {
  id: string;
  name: string;
  preview: string; // URL or color code
  type: "theme" | "font" | "background";
};

export interface ThemeSelectorProps {
  templates: CustomizationTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  templates,
  selectedId,
  onSelect,
}) => (
  <div className="theme-selector">
    <h3>Theme Options</h3>
    <div className="theme-options">
      {templates
        .filter((t) => t.type === "theme")
        .map((template) => (
          <button
            key={template.id}
            className={selectedId === template.id ? "selected" : ""}
            style={{ background: template.preview }}
            onClick={() => onSelect(template.id)}
          >
            {template.name}
          </button>
        ))}
    </div>
  </div>
);

export interface FontSelectorProps {
  templates: CustomizationTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const FontSelector: React.FC<FontSelectorProps> = ({
  templates,
  selectedId,
  onSelect,
}) => (
  <div className="font-selector">
    <h3>Font Options</h3>
    <div className="font-options">
      {templates
        .filter((t) => t.type === "font")
        .map((template) => (
          <button
            key={template.id}
            className={selectedId === template.id ? "selected" : ""}
            style={{ fontFamily: template.preview }}
            onClick={() => onSelect(template.id)}
          >
            {template.name}
          </button>
        ))}
    </div>
  </div>
);

export interface BackgroundSelectorProps {
  templates: CustomizationTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  templates,
  selectedId,
  onSelect,
}) => (
  <div className="background-selector">
    <h3>Background Options</h3>
    <div className="background-options">
      {templates
        .filter((t) => t.type === "background")
        .map((template) => (
          <button
            key={template.id}
            className={selectedId === template.id ? "selected" : ""}
            style={{ backgroundImage: `url(${template.preview})` }}
            onClick={() => onSelect(template.id)}
          >
            {template.name}
          </button>
        ))}
    </div>
  </div>
);
