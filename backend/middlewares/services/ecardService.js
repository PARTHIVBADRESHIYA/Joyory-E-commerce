import dayjs from "dayjs";
import Festival from "../../models/Festival.js";
import Order from "../../models/Order.js";


function isBirthdayTodayOrMonth(user, now) {
    if (!user?.dob) return { match: false, monthMode: false };
    const b = dayjs(user.dob);
    const monthMode = user?.marketingPrefs?.celebrateBirthdayMonth ?? true;

    const sameDay = now.date() === b.date() && now.month() === b.month();
    const sameMonth = now.month() === b.month();

    return { match: monthMode ? sameMonth : sameDay, monthMode };
}

export async function determineOccasions({ userId, userDoc, now = dayjs() }) {
    const user = userDoc;
    let primaryOccasion = null;
    let festival = null;

    // ✅ Birthday first
    const bday = isBirthdayTodayOrMonth(user, now);
    if (bday.match) {
        primaryOccasion = "BIRTHDAY";
    }

    // ✅ Festival (only if no birthday match)
    if (!primaryOccasion) {
        const start = now.startOf("day").toDate();
        const end = now.endOf("day").toDate();
        festival = await Festival.findOne({
            active: true,
            date: { $gte: start, $lte: end },
        });
        if (festival) primaryOccasion = "FESTIVAL";
    }

    // ✅ Welcome (only if no birthday or festival)
    if (!primaryOccasion) {
        const orderCount = await Order.countDocuments({ user: user._id });
        if (orderCount <= 1) {
            primaryOccasion = "WELCOME";
        }
    }

    // ✅ Fallback
    if (!primaryOccasion) {
        primaryOccasion = "TEST";
    }

    return { occasion: primaryOccasion, festival };
}

export function craftMessage({ occasion, user, festival }) {
    switch (occasion) {
        case "BIRTHDAY":
            return `🎂 Wishing you a fantastic birthday and a wonderful year ahead, ${user?.name || "dear customer"}!`;

        case "FESTIVAL":
            return `🌸 ${festival?.message || "Joyful greetings from Joyory!"}`;

        case "WELCOME":
            return `🙌 Welcome to Joyory, ${user?.name || "dear customer"}! Thanks for your first purchase — we’re thrilled to have you.`;

        case "TEST":
        default:
            return `✅ This is a test e-card for ${user?.name || "customer"}. Your setup is working!`;
    }
}

