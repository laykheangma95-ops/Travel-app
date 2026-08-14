# Domner to China Travel App â€” Project Memory

Project name: `domner-to-china-travel-app`

This document is the reference memory for the Domner itinerary feature. It is based on the uploaded UI screenshots and should guide future implementation. Treat the screenshots as product reference, not as permission to invent unrelated requirements.

## Itinerary and trip planning

- Create a travel plan manually or with AI.
- Select one or more destinations, a start date, and an end date.
- Choose travel preferences such as Must-See Classics, Food & Drinks, Offbeat Exploration, Photo Spots, Shopping, Citywalk, Natural Scenery, and Art Exhibitions.
- AI planning accepts an editable natural-language request and can replace the generated input.
- Show AI research progress while searching for places, with a cancel action.
- Organize the generated plan by day, time range, place order, category, description, and travel distance/time between places.
- Support day tabs, Summary, and Ideas.
- Allow users to edit, reorder, expand descriptions, add places, and ask the AI assistant for changes.

## Map and routes

- Display the itinerary over a map with numbered place markers.
- Show a colored route for each day and daily total distance.
- Allow map search for places from a bottom-sheet search UI.
- Keep the map visible behind the itinerary sheet where appropriate.

## Trip overview tools

- Trip overview can include Notes, Checklist, Photos, and Weather.
- Notes support recording thoughts.
- Checklist supports adding travel items.
- Photos support adding images and selecting a cover image.
- Weather shows a multi-day forecast for the destination.

## Sharing and collaboration

- Plan together with friends and invite members.
- Share an itinerary image.
- Copy a plan link, share to Facebook or Instagram, and share a plan code.
- Support privacy settings such as visibility to link recipients.

## Trip settings

- Edit the plan name, dates, default transport, start location behavior, invited members, and privacy.
- Support starting from the previous night's accommodation when applicable.
- Show version history and allow deleting a plan.
- Transport planning includes looking up and comparing transport options.

## Home and account areas

- Home includes My Plans, countdown/status, place count, Ask, Checklist, and Weather shortcuts.
- Account area includes saved places, link history, account security, profile editing, language, deleted plans, support, and app version.
- Extract places or itineraries from text, URLs, social links, and screenshots/images.

## Visual direction

- Clean iOS-style interface.
- White surfaces, pale blue backgrounds/accents, rounded cards and bottom sheets.
- Large black primary action buttons and bright blue AI actions.
- Map-first itinerary presentation with floating actions.

## Working rule

When this file is mentioned later, use it as the accumulated Domner itinerary feature context. Do not assume unshown behavior is final; ask or wait for requirements when implementation choices are not covered by the reference.

## Domner-China Itinerary Experience

The intended user journey is:

1. The user opens Domner and starts from a destination, an existing guide, a saved place, a link, or a screenshot.
2. They create a plan by entering destinations, travel dates, and interests such as food, shopping, classic attractions, hidden places, photography, city walks, nature, or art.
3. They choose manual planning or AI planning.
4. AI turns the user's choices into an editable travel request, then searches for relevant places and shows progress with a Cancel option.
5. Domner generates a day-by-day itinerary containing places, categories, time slots, descriptions, travel distances, travel times, and transportation.
6. The itinerary appears with an interactive map, daily routes, numbered locations, and daily distance totals.
7. The user switches between Summary, individual days, and Ideas, then edits, reorders, expands, removes, or adds places and asks the AI to revise the plan.
8. The user completes the trip with Notes, Checklist, Photos, Cover image, Weather, and Transport planning.
9. The user collaborates with friends or shares the itinerary using invitations, links, codes, social sharing, or an exported itinerary image.

The experience should feel like moving from â€œWhere should I go?â€ to â€œMy complete, editable China travel plan,â€ with AI reducing planning effort while the traveler remains in control.

