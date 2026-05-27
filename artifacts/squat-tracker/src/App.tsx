import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import SquatTracker from "@/pages/SquatTracker";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SquatTracker />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
