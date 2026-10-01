// A made-up completed search, the shape `POST /searches` answers with for a
// pick, for the report's tests and for screenshots of it. None of these
// businesses, people or addresses is real; the business is the first row of
// `sample.ts`.

import type { Address, Search, WatchlistHit } from "./searches";

const OFFICE: Address = {
  street: "1200 RIVER RD",
  city: "PITTSBURGH",
  state: "PA",
  zip: "15212",
  rdi: "Commercial",
  deliverable: true,
  cmra: false,
};

const MAIL_DROP: Address = {
  street: "PO BOX 442",
  city: "BRIDGEVILLE",
  state: "PA",
  zip: "15017",
  rdi: "Commercial",
  deliverable: true,
  cmra: true,
};

const AGENT_OFFICE: Address = {
  street: "251 LITTLE FALLS DR",
  city: "WILMINGTON",
  state: "DE",
  zip: "19808",
  rdi: "Commercial",
  deliverable: true,
  cmra: false,
};

function clear(code: string, name: string): WatchlistHit {
  return { code, name, count: 0, details: [] };
}

/** The lists a search screens by default, all clear. */
export const SAMPLE_WATCHLISTS: WatchlistHit[] = [
  clear("OFAC", "Department of Treasury, Office of Foreign Assets Control"),
  clear("IEO", "IRS Exempt Organizations List"),
  clear("FBI", "FBI Wanted List"),
  clear("CSL", "Department of Commerce, Consolidated Screening List"),
  clear("CNS", "Consolidated Canadian Autonomous Sanctions List"),
  clear("OIG", "HHS OIG List of Excluded Individuals/Entities"),
];

export const SAMPLE_SEARCH: Search = {
  id: "5f0c2d3e-7a41-4b8e-9a52-0d1f6c8e2b17",
  state: "COMPLETED",
  name: "HARBOR CONCRETE PUMPING CO., INC.",
  address: "1200 RIVER RD, PITTSBURGH, PA 15212",
  search_address: OFFICE,
  business_name_match: "EXACT",
  business_address_match: "EXACT",
  verified: true,
  scores: [
    { type: "kyb", score: 95, rating: "A" },
    { type: "risk", score: 82, rating: "A" },
  ],
  watchlist_hits: SAMPLE_WATCHLISTS,
  warnings: [],
  error: null,
  created_at: "2026-09-30T14:21:07Z",
  updated_at: "2026-09-30T14:21:11Z",
  business: {
    id: "b3a7e1d4-52c8-4f06-8d13-7e9a0c4b6f28",
    name: "HARBOR CONCRETE PUMPING CO., INC.",
    structure: "C_CORPORATION",
    addresses: [
      { ...OFFICE, sources: ["SOS"] },
      { ...MAIL_DROP, sources: ["SOS"] },
    ],
    phone_numbers: [],
    email: null,
    website: null,
    incorporation_state: "PA",
    incorporation_date: "2011-03-14",
    months_in_business: 186,
    primary_address: OFFICE,
    alternative_names: ["HARBOR PUMPING", "HCP CONCRETE"],
    registrations: [
      {
        id: "0d9f4c71-6b2e-4a85-b1c3-92e7a5f08d46",
        name: "HARBOR CONCRETE PUMPING CO., INC.",
        issue_date: "2011-03-14",
        dissolution_date: null,
        file_number: "4017743",
        state: "PA",
        address: OFFICE,
        registration_type: "domestic",
        status: "active",
        standing: "In Good Standing",
        registered_agent: {
          name: "MERIDIAN REGISTERED AGENTS, LLC",
          address: AGENT_OFFICE,
        },
        officers: [
          { name: "DANA WHITFIELD", titles: ["PRESIDENT", "DIRECTOR"] },
          { name: "LUIS ORTEGA", titles: ["SECRETARY"] },
        ],
      },
      {
        id: "7c15e8a2-90d4-4f3b-a6e1-3b58d2c9f071",
        name: "HARBOR CONCRETE PUMPING CO., INC.",
        issue_date: "2014-08-02",
        dissolution_date: null,
        file_number: "1893382",
        state: "OH",
        address: null,
        registration_type: "foreign",
        status: "active",
        standing: "Active",
        registered_agent: { name: "MERIDIAN REGISTERED AGENTS, LLC" },
        officers: [],
      },
      {
        id: "e2b6a0f9-4d17-4c58-8a3e-61f4c7d95b20",
        name: "HARBOR CONCRETE PUMPING CO., INC.",
        issue_date: "2012-05-21",
        dissolution_date: "2019-11-30",
        file_number: "D07321558",
        state: "MD",
        address: null,
        registration_type: "foreign",
        status: "inactive",
        standing: "Forfeited",
        registered_agent: null,
        officers: [],
      },
    ],
    business_officers: [
      {
        name: "DANA WHITFIELD",
        titles: ["PRESIDENT", "DIRECTOR"],
        states: ["PA"],
        sources: ["SOS"],
      },
      {
        name: "LUIS ORTEGA",
        titles: ["SECRETARY"],
        states: ["PA"],
        sources: ["SOS"],
      },
    ],
    watchlist_hits: SAMPLE_WATCHLISTS,
    sec_registrations: [],
  },
  console_url:
    "https://console.baselayer.com/business/b3a7e1d4-52c8-4f06-8d13-7e9a0c4b6f28?searchId=5f0c2d3e-7a41-4b8e-9a52-0d1f6c8e2b17",
};
