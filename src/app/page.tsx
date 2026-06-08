import { MeasurementWorkspace } from "@/components/measurement/measurement-workspace";
import { getMeasurementSourceReadiness, hasSupabaseServerWriteConfig } from "@/lib/supabase/env";

export default function Home() {
  return (
    <MeasurementWorkspace
      serverWritesEnabled={hasSupabaseServerWriteConfig()}
      sourceReadiness={getMeasurementSourceReadiness()}
    />
  );
}
