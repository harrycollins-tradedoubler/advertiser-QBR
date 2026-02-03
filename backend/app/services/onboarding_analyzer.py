import re
from typing import Any


# Onboarding step definitions
ONBOARDING_STEPS = [
    {
        "id": "branded_tracking",
        "name": "Branded Tracking",
        "description": "Website domain and subdomain setup for tracking",
        "icon": "",
        "order": 1,
    },
    {
        "id": "product_feed",
        "name": "Product Feed",
        "description": "Product feed URL connection",
        "icon": "",
        "order": 2,
    },
    {
        "id": "logo_upload",
        "name": "Logo Upload",
        "description": "Program logo (350x130px)",
        "icon": "",
        "order": 3,
    },
    {
        "id": "banner_ads",
        "name": "Banner Ads",
        "description": "Banner creatives in required sizes",
        "icon": "",
        "order": 4,
    },
    {
        "id": "terms_conditions",
        "name": "Terms & Conditions",
        "description": "Program terms and conditions document",
        "icon": "",
        "order": 5,
    },
    {
        "id": "ip_whitelisting",
        "name": "IP Whitelisting",
        "description": "Office IP addresses for exclusion",
        "icon": "",
        "order": 6,
    },
    {
        "id": "tracking_confirmation",
        "name": "Tracking Confirmation",
        "description": "Test sale completed and tracking confirmed",
        "icon": "",
        "order": 7,
    },
]


def analyze_branded_tracking(messages: list[dict]) -> dict:
    """Check if branded tracking setup is completed."""
    domain_provided = False
    subdomains_confirmed = False
    domain_value = None

    for msg in messages:
        user_msg = (msg.get("user_message") or "").lower()
        response = (msg.get("response") or "").lower()

        # Check if user provided a domain
        if any(kw in response for kw in ["website domain", "branded tracking", "subdomains"]):
            # Look for domain in user message (URL-like pattern)
            url_match = re.search(
                r'(?:https?://)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})',
                msg.get("user_message") or ""
            )
            if url_match:
                domain_provided = True
                domain_value = url_match.group(0)

        # Check if subdomains were confirmed
        if any(kw in response for kw in ["visit.", "statics."]):
            if any(kw in user_msg for kw in ["yes", "good", "correct", "confirm", "looks good", "all good"]):
                subdomains_confirmed = True
            # Also mark as in progress if subdomains were proposed
            domain_provided = True

        # Extract domain from response if mentioned
        if not domain_value:
            domain_match = re.search(r'visit\.([a-zA-Z0-9-]+\.[a-zA-Z]{2,})', msg.get("response") or "")
            if domain_match:
                domain_value = domain_match.group(1)

    if subdomains_confirmed:
        status = "completed"
        details = f"Domain: {domain_value}" if domain_value else "Subdomains confirmed"
        if domain_value:
            details += f" | Subdomains: visit.{domain_value}, statics.{domain_value}"
    elif domain_provided:
        status = "in_progress"
        details = f"Domain provided: {domain_value}" if domain_value else "Awaiting subdomain confirmation"
    else:
        status = "not_started"
        details = "Website domain not yet provided"

    return {"status": status, "details": details}


def analyze_product_feed(messages: list[dict]) -> dict:
    """Check if product feed URL was provided."""
    feed_mentioned = False
    feed_provided = False
    feed_skipped = False
    last_feed_url_index = -1
    last_not_ready_index = -1
    last_confirm_index = -1

    for idx, msg in enumerate(messages):
        user_msg = (msg.get("user_message") or "").lower()
        response = (msg.get("response") or "").lower()

        if "product feed" in response:
            feed_mentioned = True

        # Check if user said it's not ready
        if feed_mentioned and any(kw in user_msg for kw in ["not ready", "not yet", "don't have", "later", "skip"]):
            feed_skipped = True
            last_not_ready_index = idx

        # Check if a URL was provided in the context of product feed
        if "product feed" in response or "feed url" in response:
            url_match = re.search(r'https?://[^\s]+', msg.get("user_message") or "")
            if url_match:
                feed_provided = True
                last_feed_url_index = idx

        # Explicit confirmation signals after a URL is shared
        if any(kw in response for kw in ["feed looks good", "feed confirmed", "feed approved", "feed verified"]):
            last_confirm_index = idx
        if "product feed" in response and any(
            kw in user_msg for kw in ["yes", "confirmed", "looks good", "all good", "approved"]
        ):
            last_confirm_index = idx

    if feed_provided:
        if last_not_ready_index > last_feed_url_index:
            return {"status": "in_progress", "details": "Product feed not ready yet"}
        if last_confirm_index >= last_feed_url_index:
            return {"status": "completed", "details": "Product feed URL provided and confirmed"}
        return {"status": "in_progress", "details": "Link provided - with technical team"}
    if feed_skipped:
        return {"status": "in_progress", "details": "Deferred - feed not ready yet"}
    if feed_mentioned:
        return {"status": "in_progress", "details": "Product feed discussed, awaiting URL"}
    return {"status": "not_started", "details": "Product feed not yet discussed"}


def analyze_logo_upload(messages: list[dict]) -> dict:
    """Check if logo was uploaded and validated."""
    logo_uploaded = False
    logo_confirmed = False

    for msg in messages:
        user_msg = (msg.get("user_message") or "").lower()
        response = (msg.get("response") or "").lower()

        if "logo" in user_msg and ("upload" in user_msg or "uploading" in user_msg):
            logo_uploaded = True

        if logo_uploaded and any(kw in user_msg for kw in ["correct size", "correct dimensions", "yes", "350x130", "correct"]):
            if "logo" in response or "350" in response:
                logo_confirmed = True

    if logo_confirmed:
        return {"status": "completed", "details": "Logo uploaded and validated (350x130px)"}
    if logo_uploaded:
        return {"status": "in_progress", "details": "Logo uploaded, awaiting dimension validation"}
    return {"status": "not_started", "details": "Logo not yet uploaded"}


def analyze_banner_ads(messages: list[dict]) -> dict:
    """Check if banner ads were uploaded."""
    banners_mentioned = False
    banners_uploaded = False
    required_sizes = ["160x600", "300x250", "300x600", "728x90", "928x70"]

    for msg in messages:
        user_msg = (msg.get("user_message") or "").lower()
        response = (msg.get("response") or "").lower()

        if any(size in response for size in required_sizes):
            banners_mentioned = True

        if "banner" in user_msg and ("upload" in user_msg or "uploading" in user_msg):
            banners_uploaded = True

    if banners_uploaded:
        return {"status": "in_progress", "details": "Banner ads uploaded, awaiting validation"}
    if banners_mentioned:
        return {"status": "in_progress", "details": "Banner requirements communicated (5 sizes needed)"}
    return {"status": "not_started", "details": "Banner ads not yet discussed"}


def analyze_terms_conditions(messages: list[dict]) -> dict:
    """Check if T&C document was uploaded."""
    tc_mentioned = False
    tc_uploaded = False

    for msg in messages:
        user_msg = (msg.get("user_message") or "").lower()
        response = (msg.get("response") or "").lower()

        if "terms" in response and "conditions" in response:
            tc_mentioned = True

        if ("terms" in user_msg or "t&c" in user_msg or "t&cs" in user_msg) and (
            "upload" in user_msg or "uploading" in user_msg
        ):
            tc_uploaded = True

    if tc_uploaded:
        return {"status": "completed", "details": "Terms & conditions document uploaded"}
    if tc_mentioned:
        return {"status": "in_progress", "details": "T&C requirements communicated, awaiting upload"}
    return {"status": "not_started", "details": "Terms & conditions not yet discussed"}


def analyze_ip_whitelisting(messages: list[dict]) -> dict:
    """Check if IP whitelisting was completed."""
    ip_mentioned = False
    ip_provided = False

    for msg in messages:
        user_msg = (msg.get("user_message") or "").lower()
        response = (msg.get("response") or "").lower()

        if "ip address" in response or "ip whitelist" in response or "office ip" in response:
            ip_mentioned = True

        # Check if IP addresses were provided
        ip_match = re.search(r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', msg.get("user_message") or "")
        if ip_match and ip_mentioned:
            ip_provided = True

    if ip_provided:
        return {"status": "completed", "details": "Office IP addresses provided"}
    if ip_mentioned:
        return {"status": "in_progress", "details": "IP whitelisting discussed, awaiting addresses"}
    return {"status": "not_started", "details": "IP whitelisting not yet discussed"}


def analyze_tracking_confirmation(messages: list[dict]) -> dict:
    """Check if test sale was completed and tracking confirmed."""
    test_sale_mentioned = False
    tracking_confirmed = False

    for msg in messages:
        user_msg = (msg.get("user_message") or "").lower()
        response = (msg.get("response") or "").lower()
        combined = f"{user_msg} {response}"

        if "test sale" in combined or "test order" in combined:
            test_sale_mentioned = True

        if any(kw in combined for kw in ["tracking confirmed", "tracking complete", "tracking completed"]):
            tracking_confirmed = True

        if "tracking" in combined and any(kw in combined for kw in ["confirmed", "complete", "completed"]):
            tracking_confirmed = True

    if tracking_confirmed and test_sale_mentioned:
        return {"status": "completed", "details": "Test sale completed and tracking confirmed"}
    if test_sale_mentioned:
        return {"status": "in_progress", "details": "Test sale mentioned, awaiting tracking confirmation"}
    return {"status": "not_started", "details": "Tracking confirmation not yet discussed"}


# Map step IDs to analyzer functions
ANALYZERS = {
    "branded_tracking": analyze_branded_tracking,
    "product_feed": analyze_product_feed,
    "logo_upload": analyze_logo_upload,
    "banner_ads": analyze_banner_ads,
    "terms_conditions": analyze_terms_conditions,
    "ip_whitelisting": analyze_ip_whitelisting,
    "tracking_confirmation": analyze_tracking_confirmation,
}


def analyze_onboarding(messages: list[dict]) -> dict[str, Any]:
    """
    Analyze all conversation messages and return full onboarding status.

    Args:
        messages: List of conversation row dicts with user_message, response, created_at, etc.

    Returns:
        Dict with program info, steps, and overall progress
    """
    # Sort messages by created_at (oldest first)
    sorted_msgs = sorted(messages, key=lambda m: m.get("created_at", ""))

    # Extract program info
    company_name = None
    for msg in sorted_msgs:
        cn = msg.get("company_name")
        if cn and cn.lower() != "null":
            company_name = cn
            break

    started_at = sorted_msgs[0].get("created_at") if sorted_msgs else None
    last_activity = sorted_msgs[-1].get("created_at") if sorted_msgs else None

    # Analyze each step
    steps = []
    completed_count = 0
    total_steps = len(ONBOARDING_STEPS)

    for step_def in ONBOARDING_STEPS:
        analyzer = ANALYZERS[step_def["id"]]
        result = analyzer(sorted_msgs)

        if result["status"] == "completed":
            completed_count += 1

        steps.append({
            "id": step_def["id"],
            "name": step_def["name"],
            "description": step_def["description"],
            "icon": step_def["icon"],
            "order": step_def["order"],
            "status": result["status"],
            "details": result["details"],
        })

    # Calculate overall progress
    # completed = 100%, in_progress = 50%, not_started = 0%
    progress_points = 0
    for step in steps:
        if step["status"] == "completed":
            progress_points += 100
        elif step["status"] == "in_progress":
            progress_points += 50

    overall_progress = round(progress_points / total_steps) if total_steps > 0 else 0

    return {
        "companyName": company_name or "Unknown",
        "startedAt": started_at,
        "lastActivity": last_activity,
        "totalMessages": len(sorted_msgs),
        "isComplete": completed_count == total_steps,
        "overallProgress": overall_progress,
        "completedSteps": completed_count,
        "totalSteps": total_steps,
        "steps": steps,
    }
