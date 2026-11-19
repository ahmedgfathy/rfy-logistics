# Competitor & reference research

Desk research on the references supplied by the client, combined with the live service
structure observed on their public pages. Nothing here was copied: no copy, images, code
or brand assets were reused.

| Reference | What works | What to avoid | Adopted |
| --- | --- | --- | --- |
| **Elbedaya Logistics** (Alexandria) | Clear service split: Sea Freight, Air Freight, Inland Haulage, Customs Clearance, Packing & Storage, Freight Forwarding. Quote + vacancies + news in the primary nav. Plain statement of company age and follow-up model. | Injected spam links in the homepage body, dated typography, duplicated service cards, anonymous statistics counters with no source. | Service taxonomy, "Request a Quote" as a first-class nav item, a 24-hour follow-up promise expressed as an operational commitment rather than a counter. |
| **Janna Logistics** | Air / Sea / Road plus customs clearance, immediate quote entry points, booking-oriented inquiry journey. | Generic stock imagery, weak hierarchy, unsupported instant pricing claims. | A quote journey split into three short steps, and an explicit "we do not invent prices" position (written quotation, no fake instant rates). |
| **HNR Group** | Shipping + customs clearance + trucking + shipment reports; Egyptian-company credibility signals. | Flat visual system, dense paragraphs, no empty/error states, no mobile-first thinking. | Shipment reporting as a product feature (tracking + milestones recorded by operations). |
| **EGTT Logistics** | Corporate About page, transportation, warehousing, inventory management. | Template-grade Odoo site, boilerplate copy, no differentiation. | Decision **not** to claim warehousing we do not own — storage is offered through vetted partner facilities and stated as such. |
| **Flexport** | Digital-first narrative, confident type hierarchy, product-as-hero, restrained palette, data visualisation. | Heavy product-login dependency; not appropriate for a mid-sized forwarder without a customer portal. | Editorial hero composition, dark navy + amber accent system, generous whitespace, one strong primary CTA per screen. |
| **Maersk** | Tracking is the first action on the page; corporate identity is unmistakable; deep service architecture. | Enormous mega-menu, dense corporate navigation that overwhelms a smaller company. | Tracking entry in the hero, a compact services dropdown (7 items max), and a mobile menu that does not hide the CTA. |
| **Kuehne+Nagel** | Rigorous service architecture, consistent page templates, strong corporate About pages. | Very text-heavy corporate copy; little emotional pull. | A single service template with genuinely different body copy per service, not one text with swapped titles. |
| **project44** | Data-driven visual language, network/route graphics, technology credibility. | Abstract enterprise visuals that say little to an importer. | An indicative trade-lane diagram, explicitly labelled as indicative — not a fake world map of offices. |
| **DHL / DSV (Egypt pages)** | Local gateway lists, office details, opening hours, customs content, country-specific landing pages. | Heavy global navigation and gated content. | Gateway list (Alexandria, Dekheila, Damietta, Port Said, Sokhna, Adabiya, Safaga, Cairo Airport) and clear local contact details. |

## Patterns common to the strong references

1. **Tracking above the fold** — the visitor with a live shipment is the highest-intent user.
2. **One accountable promise** — "one team, one file" beats a wall of adjectives.
3. **Service pages that state what is included** — bullet-level specificity, not paragraphs.
4. **Local gateways named explicitly** — Egyptian buyers scan for their port.
5. **Quote forms that ask for the shipment, not for marketing consent** — and short enough to finish.

## Common failure modes observed

- Anonymous counters ("5000 clients", "20 years") with no source → **excluded** from this build.
- Testimonials and partner logos without permission → models exist but no records are seeded, and the UI hides the section while it is empty.
- "Instant rates" that are not real → **excluded**; the site promises a written quotation within one business day.
- Invented live tracking positions → **excluded**; tracking only shows recorded milestones, and seeded records are labelled *Demonstration data*.

## Limitations of this research

The four Egyptian sites were reviewed through their public pages (homepage + services).
Two of them load third-party injected links; their content was not relied upon. Design
inspection of the international references is based on their public marketing pages.
No paid design-tool screenshots (Dribbble/Figma) were reproduced.

A full visual audit — screenshots at three breakpoints per reference, colour extraction,
and interaction recording — remains a manual task for the design owner before the brand
identity is finalised.
