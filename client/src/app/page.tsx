import CalendarCreator from "./components/CalendarCreator";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-center">
          <CalendarCreator />
        </div>
      </main>
    </div>
  );
}
