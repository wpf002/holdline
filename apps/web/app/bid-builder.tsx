"use client";

import { WAIVER_KEYS, type BidIntent, type CompileResponse } from "@holdline/types";
import { useId, useRef, useState } from "react";
import { compileBid, parseDescription, vendorName, type AirlineOption } from "../lib/api";
import {
  LONGEST_TRIP,
  describePreference,
  emptyDraft,
  monthLabel,
  orderedPriorities,
} from "../lib/draft";
import { CompiledBidView } from "./compiled-bid";
import { DaysOffPicker } from "./days-off-picker";
import { CreditInputs, NumberSelect, SpecificPairings, TimeField } from "./fields";
import { PriorityList } from "./priority-list";
import { Section } from "./section";
import { Segmented } from "./segmented";
import { StationList } from "./station-list";

type Crew = BidIntent["crewGroup"];
const CREW_LABELS: Record<Crew, string> = { PILOT: "Pilot", FLIGHT_ATTENDANT: "Flight attendant" };
const CREW_PLURAL: Record<Crew, string> = {
  PILOT: "pilots",
  FLIGHT_ATTENDANT: "flight attendants",
};
const SOURCE_LABELS = {
  CONFIRMED: "Source: the airline or union.",
  THIRD_PARTY: "Source: a third-party site, not the airline or union.",
  INFERRED: "Inferred from public documents, not confirmed.",
} as const;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export function BidBuilder({
  airlines,
  apiUrl,
  months,
}: {
  airlines: AirlineOption[];
  apiUrl: string;
  months: string[];
}) {
  const ids = {
    airline: useId(),
    base: useId(),
    month: useId(),
    seniority: useId(),
    describe: useId(),
  };
  const [draft, setDraft] = useState<BidIntent>(() =>
    emptyDraft({ airline: "", crewGroup: "PILOT", month: months[1] ?? months[0]!, base: "" }),
  );
  // Bumped when the parser replaces the draft, so fields that keep their own text remount.
  const [formVersion, setFormVersion] = useState(0);
  const [description, setDescription] = useState("");
  // Seniority only feeds hold estimates; it isn't part of the bid.
  const [seniority, setSeniority] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [result, setResult] = useState<{ bid: CompileResponse; builtFrom: string } | null>(null);
  const outputRef = useRef<HTMLElement>(null);

  const airline = airlines.find((a) => a.code === draft.airline);
  const deployment = airline?.deployments.find((d) => d.crewGroup === draft.crewGroup);
  const supported = deployment?.compilable ?? false;
  const priorities = orderedPriorities(draft);
  const request: BidIntent = { ...draft, base: draft.base.toUpperCase(), priorities };
  const seniorityNumber =
    /^\d+$/.test(seniority) && Number(seniority) > 0 ? Number(seniority) : undefined;
  const builtKey = JSON.stringify({ request, seniority: seniorityNumber });
  const stale = result !== null && result.builtFrom !== builtKey;
  const contextProblem = !draft.airline
    ? "Choose your airline."
    : !/^[A-Za-z]{3}$/.test(draft.base)
      ? "Enter your base as a 3-letter code."
      : null;

  const update = (patch: Partial<BidIntent>) => setDraft((d) => ({ ...d, ...patch }));
  const updateDaysOff = (patch: Partial<BidIntent["daysOff"]>) =>
    setDraft((d) => ({ ...d, daysOff: { ...d.daysOff, ...patch } }));
  const updatePairings = (patch: Partial<BidIntent["pairings"]>) =>
    setDraft((d) => ({ ...d, pairings: { ...d.pairings, ...patch } }));
  const updateLine = (patch: Partial<BidIntent["line"]>) =>
    setDraft((d) => ({ ...d, line: { ...d.line, ...patch } }));

  function chooseAirline(code: string) {
    const crews = airlines.find((a) => a.code === code)?.deployments.map((d) => d.crewGroup) ?? [];
    setDraft((d) => ({
      ...d,
      airline: code,
      crewGroup: crews.includes(d.crewGroup) ? d.crewGroup : (crews[0] ?? d.crewGroup),
    }));
  }

  function setTripLength(min: number, max: number) {
    updatePairings({ lengthDays: min === 1 && max === LONGEST_TRIP ? undefined : { min, max } });
  }

  async function fillFromDescription() {
    if (contextProblem) return setParseError(contextProblem);
    setParsing(true);
    setParseError(null);
    setQuestions([]);
    const res = await parseDescription(apiUrl, {
      text: description,
      context: {
        airline: draft.airline,
        crewGroup: draft.crewGroup,
        month: draft.month,
        base: draft.base.toUpperCase(),
      },
    });
    setParsing(false);
    if (!res.ok) return setParseError(res.message);
    if (res.data.intent) {
      setDraft(res.data.intent);
      setFormVersion((v) => v + 1);
    }
    setQuestions(res.data.questions);
  }

  async function build() {
    const problem =
      contextProblem ?? (priorities.length === 0 ? "Add at least one preference first." : null);
    if (problem) return setBuildError(problem);
    setBuilding(true);
    setBuildError(null);
    const res = await compileBid(apiUrl, request, seniorityNumber);
    setBuilding(false);
    if (!res.ok) return setBuildError(res.message);
    setResult({ bid: res.data, builtFrom: builtKey });
    // On wide screens the bid sits beside the form; on narrow ones, scroll down to it.
    if (!window.matchMedia("(min-width: 1100px)").matches) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() =>
        outputRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }),
      );
    }
  }

  const { pairings, line } = draft;
  const trip = pairings.lengthDays ?? { min: 1, max: LONGEST_TRIP };

  return (
    <div className="workspace">
      <div className="inputs">
        <Section id="context-title" step="01" title="Bid month">
          <div className="row">
            <div className="field">
              <label className="label" htmlFor={ids.airline}>
                Airline
              </label>
              <select
                id={ids.airline}
                className="select"
                value={draft.airline}
                onChange={(e) => chooseAirline(e.target.value)}
              >
                <option value="">Choose your airline</option>
                {airlines.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name} ({a.code})
                  </option>
                ))}
              </select>
            </div>
            <Segmented
              label="Crew"
              value={draft.crewGroup}
              options={(["PILOT", "FLIGHT_ATTENDANT"] as const).map((c) => ({
                value: c,
                label: CREW_LABELS[c],
                disabled:
                  airline !== undefined && !airline.deployments.some((d) => d.crewGroup === c),
              }))}
              onChange={(crewGroup) => update({ crewGroup })}
            />
          </div>
          <div className="row">
            <div className="field">
              <label className="label" htmlFor={ids.base}>
                Base
              </label>
              <input
                id={ids.base}
                className="input input-code"
                value={draft.base}
                maxLength={3}
                placeholder="DFW"
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => update({ base: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={ids.month}>
                Month
              </label>
              <select
                id={ids.month}
                className="select"
                value={draft.month}
                onChange={(e) => update({ month: e.target.value })}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor={ids.seniority}>
                Seniority
              </label>
              <input
                id={ids.seniority}
                className="input input-narrow mono"
                value={seniority}
                inputMode="numeric"
                placeholder="Optional"
                autoComplete="off"
                aria-describedby={`${ids.seniority}-hint`}
                onChange={(e) => setSeniority(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Segmented
              label="Bidding for"
              value={draft.lineType}
              options={[
                { value: "LINEHOLDER", label: "A line" },
                { value: "RESERVE", label: "Reserve" },
              ]}
              onChange={(lineType) => update({ lineType })}
            />
          </div>
          <p className="hint" id={`${ids.seniority}-hint`}>
            Your seniority number in this base and seat, for hold estimates from past award results.
            Holdline uses it for the estimate and doesn&apos;t save it.
          </p>
          {airline && deployment && (
            <p className="hint">
              {airline.name} {CREW_PLURAL[draft.crewGroup]} bid in{" "}
              {vendorName(deployment.vendor, deployment.dialect)}.{" "}
              {SOURCE_LABELS[deployment.confidence]}
              {!supported && " Holdline can't write bids for it yet."}
            </p>
          )}
        </Section>

        <Section
          id="describe-title"
          step="02"
          title="Describe it"
          hint="Optional. Holdline fills in the form below from your description. Check what it filled in before you build."
        >
          <div className="field">
            <label className="label" htmlFor={ids.describe}>
              What do you want next month?
            </label>
            <textarea
              id={ids.describe}
              className="textarea"
              value={description}
              maxLength={2000}
              placeholder="Off the 10th through 12th. 3-day trips, no reports before 8. Avoid ORD overnights. 75 to 85 hours. Days off matter most."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="button"
              onClick={fillFromDescription}
              disabled={parsing || !description.trim()}
              aria-busy={parsing}
            >
              {parsing ? "Reading…" : "Fill in the form"}
            </button>
          </div>
          {parseError && (
            <p className="error-text" role="alert">
              {parseError}
            </p>
          )}
          {questions.length > 0 && (
            <div className="notice" role="status">
              <p className="notice-title">Questions about your description</p>
              <ul>
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section id="days-title" step="03" title="Days off">
          <DaysOffPicker month={draft.month} daysOff={draft.daysOff} onChange={updateDaysOff} />
        </Section>

        <Section id="trips-title" step="04" title="Trips">
          <div className="row">
            <NumberSelect
              label="Shortest trip (days)"
              value={trip.min === 1 ? undefined : trip.min}
              options={range(2, LONGEST_TRIP)}
              onChange={(v = 1) => setTripLength(v, Math.max(trip.max, v))}
            />
            <NumberSelect
              label="Longest trip (days)"
              value={trip.max === LONGEST_TRIP ? undefined : trip.max}
              options={range(1, LONGEST_TRIP - 1)}
              onChange={(v = LONGEST_TRIP) => setTripLength(Math.min(trip.min, v), v)}
            />
          </div>
          <div className="row">
            <TimeField
              label="Report after"
              value={pairings.reportAfter}
              onChange={(reportAfter) => updatePairings({ reportAfter })}
            />
            <TimeField
              label="Release before"
              value={pairings.releaseBefore}
              onChange={(releaseBefore) => updatePairings({ releaseBefore })}
            />
            <NumberSelect
              label="Most legs in a duty day"
              value={pairings.maxLegsPerDuty}
              options={range(1, 6)}
              onChange={(maxLegsPerDuty) => updatePairings({ maxLegsPerDuty })}
            />
          </div>
          <div className="group">
            <label className="check">
              <input
                type="checkbox"
                checked={pairings.avoidRedeyes}
                onChange={(e) => updatePairings({ avoidRedeyes: e.target.checked })}
              />
              <span>No red-eyes</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={pairings.avoidDeadheads}
                onChange={(e) => updatePairings({ avoidDeadheads: e.target.checked })}
              />
              <span>No deadheads</span>
            </label>
            <p className="hint">
              Red-eyes, deadheads and legs per day are hard limits: Holdline keeps them even when
              PBS has to drop your other wishes.
            </p>
          </div>
        </Section>

        <Section id="layovers-title" step="05" title="Layovers">
          <div className="row row-top">
            <StationList
              label="Avoid layovers in"
              stations={pairings.avoidLayovers}
              onChange={(avoidLayovers) => updatePairings({ avoidLayovers })}
            />
            <StationList
              label="Prefer layovers in"
              stations={pairings.preferLayovers}
              onChange={(preferLayovers) => updatePairings({ preferLayovers })}
            />
          </div>
        </Section>

        <Section id="line-title" step="06" title="Credit and work blocks">
          <CreditInputs
            key={`credit-${formVersion}`}
            value={line.creditMinutes}
            onChange={(creditMinutes) => updateLine({ creditMinutes })}
          />
          <div className="row">
            <NumberSelect
              label="Most days on in a row"
              value={line.maxDaysOn}
              options={range(1, 7)}
              onChange={(maxDaysOn) => updateLine({ maxDaysOn })}
            />
            <NumberSelect
              label="Fewest days off in a row"
              value={line.minDaysOffInARow}
              options={range(1, 6)}
              onChange={(minDaysOffInARow) => updateLine({ minDaysOffInARow })}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={line.commutable}
              onChange={(e) => updateLine({ commutable: e.target.checked })}
            />
            <span>I commute to my base</span>
          </label>
        </Section>

        <Section
          id="pairings-title"
          step="07"
          title="Specific pairings"
          hint="Pairings from the bid packet you want most, by number and date."
        >
          <SpecificPairings
            key={`pairings-${formVersion}-${draft.month}`}
            month={draft.month}
            pairings={pairings.specific}
            onChange={(specific) => updatePairings({ specific })}
          />
        </Section>

        <Section
          id="waivers-title"
          step="08"
          title="Waivers"
          hint="Waivers let PBS build lines your contract otherwise blocks."
        >
          <div className="group">
            {Object.entries(WAIVER_KEYS).map(([key, text]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={draft.waivers.includes(key)}
                  onChange={(e) =>
                    update({
                      waivers: e.target.checked
                        ? [...draft.waivers, key]
                        : draft.waivers.filter((w) => w !== key),
                    })
                  }
                />
                <span>{text}</span>
              </label>
            ))}
          </div>
        </Section>
      </div>

      <aside className="aside" aria-label="Priorities and bid">
        <Section
          id="priorities-title"
          title="What matters most"
          hint="Drag to reorder, most important first. When PBS can't give you everything, it gives up the bottom of this list first."
        >
          <PriorityList
            items={priorities}
            describe={(key) => describePreference(draft, key)}
            onReorder={(keys) => update({ priorities: keys })}
          />
          <button
            type="button"
            className="button button-primary button-block"
            onClick={build}
            disabled={building || (deployment !== undefined && !supported)}
            aria-busy={building}
          >
            {building ? "Building…" : "Build my bid"}
          </button>
          {buildError && (
            <p className="error-text" role="alert">
              {buildError}
            </p>
          )}
        </Section>

        <section ref={outputRef} className="section" aria-labelledby="bid-title">
          <div className="section-head plain">
            <h2 id="bid-title">Your bid</h2>
            {result && (
              <p className="hint">
                Enter these lines in order and tick each one off. Holdline never logs in to your
                airline or submits for you.
              </p>
            )}
          </div>
          <hr className="holdline-rule" />
          {result ? (
            <div className="reveal" key={result.builtFrom}>
              <CompiledBidView
                bid={result.bid}
                stale={stale}
                poolHint={request.lineType === "LINEHOLDER"}
              />
            </div>
          ) : (
            <div className="bid-empty">
              <p>Your bid shows up here, line by line, once you build it.</p>
              <p>Pick your airline and base, add a preference, then Build my bid.</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
