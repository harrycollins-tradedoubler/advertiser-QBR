# Onboarding Dashboard - Mock Data Example

## Example API Response

When you search for a Program ID like `PROG-2024-001`, the backend returns:

```json
{
  "programId": "PROG-2024-001",
  "companyName": "Acme Corporation",
  "startedAt": "2026-01-28T14:04:03Z",
  "lastActivity": "2026-01-30T09:40:01Z",
  "totalMessages": 24,
  "isComplete": false,
  "overallProgress": 67,
  "completedSteps": 4,
  "totalSteps": 6,
  "steps": [
    {
      "id": "branded_tracking",
      "name": "Branded Tracking",
      "description": "Website domain and subdomain setup for tracking",
      "icon": "🔗",
      "order": 1,
      "status": "completed",
      "details": "Domain: acme.com — Subdomains: visit.acme.com, statics.acme.com"
    },
    {
      "id": "product_feed",
      "name": "Product Feed",
      "description": "Product feed URL connection",
      "icon": "📦",
      "order": 2,
      "status": "in_progress",
      "details": "Product feed discussed, awaiting URL"
    },
    {
      "id": "logo_upload",
      "name": "Logo Upload",
      "description": "Program logo (350x130px)",
      "icon": "🖼️",
      "order": 3,
      "status": "completed",
      "details": "Logo uploaded and validated (350x130px)"
    },
    {
      "id": "banner_ads",
      "name": "Banner Ads",
      "description": "Banner creatives in required sizes",
      "icon": "🎨",
      "order": 4,
      "status": "in_progress",
      "details": "Banner ads uploaded, awaiting validation"
    },
    {
      "id": "terms_conditions",
      "name": "Terms & Conditions",
      "description": "Program terms and conditions document",
      "icon": "📄",
      "order": 5,
      "status": "completed",
      "details": "Terms & conditions document uploaded"
    },
    {
      "id": "ip_whitelisting",
      "name": "IP Whitelisting",
      "description": "Office IP addresses for exclusion",
      "icon": "🛡️",
      "order": 6,
      "status": "not_started",
      "details": "IP whitelisting not yet discussed"
    }
  ]
}
```

## Visual Layout

### Header Section
- **Title**: "Onboarding Tracker"
- **Subtitle**: "Check the implementation status of any program"
- **Search Bar**: Input field with search icon + "Look Up" button

### Dashboard View (when program is found)

#### Top Row - Overview Cards
1. **Progress Ring Card** (left, 1/3 width)
   - Large circular progress ring showing 67%
   - "4 of 6 steps" text
   - Green "Implementation Complete" badge (if 100%)

2. **Program Details Card** (right, 2/3 width)
   - Grid layout with 4 info boxes:
     - 🏢 **Company**: "Acme Corporation"
     - 📈 **Program ID**: "PROG-2024-001" (monospace font)
     - 📅 **Started**: "28 Jan 2026, 14:04"
     - 💬 **Last Activity**: "30 Jan 2026, 09:40"

#### Steps Section
**Title**: "IMPLEMENTATION STEPS"

Each step card shows:
- **Step number** (1-6) in gray circle
- **Status icon**: ✅ (green) / ⏰ (amber) / ⭕ (gray)
- **Step name** with emoji icon (🔗 📦 🖼️ 🎨 📄 🛡️)
- **Status badge**: "Completed" (green) / "In Progress" (amber) / "Not Started" (gray)
- **Description**: Brief text about the step
- **Details**: Specific information extracted from conversation

**Color coding**:
- ✅ Completed: Green border + light green background
- ⏰ In Progress: Amber border + light amber background  
- ⭕ Not Started: Gray border + white background

#### Footer
- **Left**: "Total interactions: 24"
- **Right**: "Overall progress: 67%" (blue highlight)

## Search Results View

If multiple programs match, shows a list:
- Each result: Company name, Program ID, Start date, Message count
- Click to load that program's dashboard

## States

1. **Idle**: Empty state with search icon and instructions
2. **Loading**: "Searching..." with spinner
3. **Error**: Red alert box with error message
4. **Search Results**: List of matching programs
5. **Dashboard**: Full dashboard view (shown above)
