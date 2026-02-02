import zod from "zod";

export const signupzod = zod.object({
    name: zod.string(),
    email: zod.email(),
    password: zod.string(),
    role: zod.enum(["SERVICE_PROVIDER","USER"])
})

export const loginzod = zod.object({
    email: zod.email(),
    password:  zod.string()
})



export const createservice=zod.object({
    "name":zod.string(),
    "type": zod.enum(["MEDICAL", "HOUSE_HELP", "BEAUTY", "FITNESS", "EDUCATION", "OTHER" ]),
    "durationMinutes": zod.number().max(120).min(30).multipleOf(30)
})

export const setavail = zod.object({
    dayOfWeek: zod.number().max(6).min(0),
    startTime: zod.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
    endTime: zod.string().regex(/^([01]\d|2[0-3]):(00|30)$/)
}).refine(
    data => data.startTime < data.endTime
)

export const get_service = zod.object({
    type: zod.enum([ "MEDICAL", "HOUSE_HELP", "BEAUTY", "FITNESS", "EDUCATION", "OTHER"]).optional()
})

export const get_slots = zod.object({
    date: zod.string().regex(/^(19|20)\d\d[-](0[1-9]|1[0-2])[-](0[1-9]|[12][0-9]|3[01])/)
})

export const slotidZod = zod.object({
    slotId: zod.string().refine((val)=>{
        const uuidregex = zod.uuid();
        const dateregex = /^(19|20)\d\d[-](0[1-9]|1[0-2])[-](0[1-9]|[12][0-9]|3[01])/;
        const timeregex = /^([01]\d|2[0-3]):(00|30)$/;

        const parts = val.split('_') as [string, string, string]; //       XD
        
        return parts.length === 3 && uuidregex.safeParse(parts[0]).success && dateregex.test(parts[1]) && timeregex.test(parts[2]);
    })
})