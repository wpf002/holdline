export const dynamic = "force-dynamic";

type Airline = { code: string; name: string; deployments: { crewGroup: string; vendor: string }[] };

export default async function Home() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  let airlines: Airline[] = [];
  try {
    airlines = await fetch(`${api}/airlines`, { cache: "no-store" }).then((r) => r.json());
  } catch {
    // API down: render the empty state
  }
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1>Holdline</h1>
      <p>Tell it what you want. It writes your PBS bid.</p>
      <h2>Supported airlines</h2>
      {airlines.length === 0 ? (
        <p>API not reachable at {api}.</p>
      ) : (
        <ul>
          {airlines.map((a) => (
            <li key={a.code}>
              {a.name} ({a.code}): {a.deployments.map((d) => `${d.crewGroup} ${d.vendor}`).join(", ")}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
