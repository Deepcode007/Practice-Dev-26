import express, {type Request, type Response, type NextFunction} from "express";


declare global {
  namespace Express {
    interface Request {
      id: string,
      role: string
    }
  }
}