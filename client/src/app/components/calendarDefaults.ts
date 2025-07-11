// Smart defaults for the calendar app

export const DEFAULT_YEAR = new Date().getFullYear();
export const DEFAULT_THEME = {
  name: "Clean",
  background: "#fff",
  primary: "#22223b",
  accent: "#9a8c98",
};

export const DEFAULT_HOLIDAYS = [
  { date: `${new Date().getFullYear()}-01-01`, name: "New Year's Day" },
  { date: `${new Date().getFullYear()}-07-04`, name: "Independence Day" },
  { date: `${new Date().getFullYear()}-12-25`, name: "Christmas Day" },
  // Add more as needed
];

export const PLACEHOLDER_EVENTS = [
  { date: `${new Date().getFullYear()}-01-15`, title: "Project Kickoff" },
  { date: `${new Date().getFullYear()}-02-10`, title: "Team Meeting" },
  { date: `${new Date().getFullYear()}-03-22`, title: "Conference" },
  { date: `${new Date().getFullYear()}-05-05`, title: "Release v1.0" },
  { date: `${new Date().getFullYear()}-09-01`, title: "Vacation Start" },
  { date: `${new Date().getFullYear()}-09-15`, title: "Vacation End" },
  { date: `${new Date().getFullYear()}-11-23`, title: "Thanksgiving Dinner" },
];
