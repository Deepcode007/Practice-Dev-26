import express, {type Request, type Response, type NextFunction} from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
const jwtkey = process.env.JWTKEY as string;

type user = {
    role: "USER"|"SERVICE_PROVIDER",
    id: string,
    name: string,
    email: string,
    password: string,
    createdAt: Date
}


export async function token(user: user )
{
    let token = jwt.sign({
        role: user.role,
        id:user.id
    }, jwtkey)
    return token;
}


export async function auth(req:Request,res:Response, next:NextFunction)
{
    try{
        let token = req.headers?.authorization?.split(' ')[1];
        if(!token)
        {
            return res.status(401).json({
                message:" user unaothorised"
            });
        }

        let data = jwt.verify(token, jwtkey) as JwtPayload;
        req.id = data.id;
        req.role=data.role;
        next();
    }
    catch{
        return res.status(401).json({
            message:" user unaothorised"
        })
    }
}

export async function service(req:Request,res:Response, next:NextFunction)
{
    if(req.role!="SERVICE_PROVIDER")
    {
        return res.status(403).json({
            success:false,
            message: "Forbidden"
        });
    }
    else next();
}

export async function user(req:Request,res:Response, next:NextFunction)
{
    if(req.role!="USER")
    {
        return res.status(403).json({
            success:false,
            message: "Forbidden"
        });
    }
    else next();
}

export async function gettime(time:string)
{
    let min=0;
    min+= Number(time.split(':')[0])*60;
    min+= Number(time.split(':')[1]);
    return min;
}