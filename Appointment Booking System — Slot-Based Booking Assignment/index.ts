import express, {type Request, type Response, type NextFunction, request} from "express";
import { createservice, get_service, get_slots, loginzod, setavail, signupzod, slotidZod } from "./zod";
import { prisma } from "./db";
import bcrypt from "bcrypt";
import { auth, gettime, service, token, user } from "./functions";
import { gt, success } from "zod";
import { endianness } from "node:os";
import { sleep } from "bun";

const app = express();
app.use(express.json())


app.listen(process.env.PORT)

app.post("/auth/register", async(req:Request,res:Response)=>{
    try{
        let result = signupzod.safeParse(req.body);
        if(!result.success)
        {
            return res.status(400).json({
                success:false,
                message: "Invalid Inputs"
            });
        }

        let user = await prisma.user.findFirst({
            where:{
                email: result.data.email
            }
        })

        if(user)
        {
            res.status(409).json({
                success:false,
                message: "Email already exists"
            });
            return;
        }

        result.data.password = await bcrypt.hash(result.data.password, 10);

        user = await prisma.user.create({
            data: result.data
        });

        res.status(201).json({
            success: true,
            "message":`User created Successfully with id ${user.id}`
        });
    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})


app.post("/auth/login", async(req:Request,res:Response)=>{

    try{
        let result = loginzod.safeParse(req.body);
        if(!result.success)
        {
            res.status(400).json({
                success:false,
                message: "Invalid Inputs"
            });
            return;
        }
    
        let user = await prisma.user.findFirst({
            where:{
                email: result.data.email
            }
        })
    
        if(!user)
        {
            res.status(409).json({
                success:false,
                message: "User not found"
            });
            return;
        }
        if(! await bcrypt.compare(result.data.password, user.password))
        {
            res.status(401).json({
                success:false,
                message: "Unauthorised, invalid password"
            });
            return;
        }
    
        res.status(200).json({
            token: token(user)
        })
    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})

//## 3. Create Service (Service Provider Only)
//**POST** `/services`

app.post("/services", auth, service, async(req:Request,res:Response)=>{
    try{

        let result = createservice.safeParse(req.body);
        if(!result.success)
        {
            res.status(400).json({
                success:false,
                message: "Invalid Inputs"
            });
            return;
        }
    

        let service = await prisma.service.create({
            data: {
                ...result.data,
                providerId: req.id
            }
        });
        res.status(201).json({
            "id":service.id,
            "name":service.name,
            "type":service.type,
            "durationMinutes": service.type
        });

    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})




//## 4. Set Availability (Service Provider Only)

// **POST** `/services/:serviceId/availability`


app.post("/services/:serviceId/availability", auth, service, async(req:Request,res:Response)=>{
    try{

        let sid = req.params.serviceId as string;

        let result = setavail.safeParse(req.body);
        if(!result.success || !sid)
        {
            res.status(400).json({
                success:false,
                message: "Invalid Input or time format"
            });
            return;
        }
        let service = await prisma.service.findFirst({
            where: {
                id: sid
            }
        })

        if(!service)
        {
            res.status(404).json({
                success:false,
                message: "Service not found"
            });
            return;
        }

        if(service.providerId !=req.id)
        {
            return res.status(403).json({
                success:false,
                message: "Service does not belong to provider"
            });
        }

        let availability = await prisma.availability.findMany({
            where:{
                serviceId: sid,
                dayOfWeek: result.data.dayOfWeek,
                startTime: { lt: result.data.endTime },
                endTime: { gt: result.data.startTime }
            }
        })

        if(availability.length)
        {
            res.status(409).json({
                success:false,
                message: "Overlapping availability"
            });
            return;
        }

        // check done

        let new_availibility = await prisma.availability.create({
            data: {
                ...result.data,
                serviceId: sid
            }
        });

        res.status(201).json({
            success: true,
            message: "Availability created successfully",
            data: new_availibility
        })

    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})

// ## 5. Get Services (Filter by Type)
// **GET** `/services`
// ### Query Parameters (Optional)
// - `type=MEDICAL`

app.get("/services", auth, async(req:Request,res:Response)=>{
    try{
        let result = get_service.safeParse(req.query);
        if(!result.success)
        {
            res.status(400).json({
                success:false,
                message: "Invalid service type"
            });
            return;
        }

        let services = await prisma.service.findMany({
            where: result.data,
            select:{
                id: true,
                name: true,
                type: true,
                durationMinutes: true,
                provider:{
                    select:{
                        name: true
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            data: services
        })
    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})


// ## 6. Get Slots for a Service (Derived)
// **GET** `/services/:serviceId/slots?date=YYYY-MM-DD`

app.get("/services/:serviceId/slots", auth, async(req:Request,res:Response)=>{
    try{
        let result = get_slots.safeParse(req.query);
        let sid = req.params.serviceId as string;
        if(!result.success || !sid)
        {
            return res.status(400).json({
                success: false,
                error: "Invalid date or format"
            });
        }

        let service = await prisma.service.findFirst({
            where:{
                id: sid
            }
        });

        if(!service)
        {
            return res.status(404).json({
                success: false,
                error: "Service not found"
            });
        }

        let availability = await prisma.availability.findMany({
            where: {
                serviceId: sid,
                dayOfWeek: new Date(result.data.date).getDay()
            }
        });

        let slot = [];
        for(let i of availability)
        {
            let totalmin = await gettime(i.endTime) - await gettime(i.startTime);
            if( totalmin / service.durationMinutes > 1 )
            {
                let time: any = i.startTime;
                while(totalmin>0)
                {
                    totalmin/=service.durationMinutes;
                    let endtime;
                    if(service.durationMinutes>=60) {
                        let hr:(number|string) = (Number(time.split(':')[0]) + (service.durationMinutes/60))
                        hr=hr<10?'0'+hr.toString() : hr.toString();
                        endtime = hr + time.split(':')[1];
                    }
                    slot.push({
                        slotId: `${service.id}_${result.data.date}_${time}`,
                        startTime: time,
                        endTime: endtime
                    })
                    time=endtime;
                }
            }
            else slot.push({
                slotId: `${service.id}_${result.data.date}_${i.startTime}`,
                startTime: i.startTime,
                endTime: i.endTime
            })
        }

        // all slots ready;

        res.status(200).json({
            success: true,
            data: {
                serviceId: service.id,
                date: result.data.date,
                slots: slot
            }
        })
    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }

})


//## Book Appointment (User Only)
// **POST** `/appointments`

app.post("/appointments", auth, user, async(req:Request,res:Response)=>{
    try{
        let result = slotidZod.safeParse(req.body);
        if(!result.success)
        {
            return res.status(400).json({
                success:false,
                error: "Invalid slotId or time"
            });
        }

        let uuid = result.data.slotId.split('_')[0] as string;
        let date = result.data.slotId.split('_')[1] as string;
        let service = await prisma.service.findFirst({
            where:{
                id: uuid
            }
        });

        if(!service)
        {
            return res.status(404).json({
                success: false,
                error: "Service not found"
            });
        }

        let availability = await prisma.availability.findMany({
            where: {
                serviceId: uuid,
                dayOfWeek: new Date(date).getDay()
            }
        });

        if(availability.length==0)
        {
            return res.status(404).json({
                success: false,
                error: "Slot not available at given date"
            });
        }
        let slot = [];
        for(let i of availability)
        {
            let totalmin = await gettime(i.endTime) - await gettime(i.startTime);
            if( totalmin / service.durationMinutes > 1 )
            {
                let time: any = i.startTime;
                while(totalmin>0)
                {
                    totalmin/=service.durationMinutes;
                    let endtime;
                    if(service.durationMinutes>=60) {
                        let hr:(number|string) = (Number(time.split(':')[0]) + (service.durationMinutes/60))
                        hr=hr<10?'0'+hr.toString() : hr.toString();
                        endtime = hr + time.split(':')[1];
                    }
                    slot.push({
                        slotId: `${service.id}_${date}_${time}`,
                        startTime: time,
                        endTime: endtime as string
                    })
                    time=endtime;
                }
            }
            else slot.push({
                slotId: `${service.id}_${date}_${i.startTime}`,
                startTime: i.startTime,
                endTime: i.endTime
            })
        }

        // slots are ready.
        let flag = false;
        let found;
        for(let i of slot)
        {
            if(i.slotId==result.data.slotId)
            {
                flag=true;
                found = i;
                break;
            }
        }

        if(!flag)
        {
            return res.status(404).json({
                success: false,
                error: " Slot not available at given time"
            });
        }
        let booked = await prisma.appointment.findFirst({
            where: {
                slotId: result.data.slotId
            }
        })

        if(booked)
        {
            return res.status(409).json({
                success: false,
                error: "Slot already booked"
            });
        }

        booked = await prisma.appointment.create({
            data:{
                userId: req.id,
                serviceId: uuid,
                date: date,
                slotId: result.data.slotId,
                startTime: found!.startTime,
                endTime: found!.endTime,
                status: "BOOKED"
            }
        });

        res.status(201).json({
            success: true,
            data: {
                id: booked.id,
                slotId: booked.slotId,
                status: booked.status
            }
        });

    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})

// 8. get my appointments

app.get("/appointments/me", auth, user, async(req:Request,res:Response)=>{
    try{
        let appointments = await prisma.appointment.findMany({
            where:{
                userId: req.id
            }
        });

        res.status(200).json({
            success: true,
            data: appointments
        });
    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})


//### 9. Provider Daily Schedule

// **GET** `/providers/me/schedule?date=YYYY-MM-DD`

app.get("/providers/me/schedule", auth, service, async(req:Request,res:Response)=>{
    try{
        let result = get_slots.safeParse(req.query);

        if(!result.success)
        {
            return res.status(400).json({
                success: false,
                error: "Invalid date format"
            });
        }

        let schedule = await prisma.appointment.groupBy({
            by:["serviceId"],
            where:{
                date: result.data.date,
                service:{
                    providerId: req.id
                }
            }
        })

        res.status(200).json({
            success: true,
            data: schedule
        })
    }
    catch(e)
    {
        return res.status(500).json({
            error:"Internal server error"
        })
    }
})