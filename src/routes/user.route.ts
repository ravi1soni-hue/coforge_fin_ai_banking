import express from "express";

var router = express.Router();

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';




router.post("init-user",(req,res)=>{



})



export interface InitUserReq {
    external_user_id: string;
    external_jwt: string;
    full_name: string | null;
    country_code: string | null;
    base_currency: string | null;
    timezone: string | null;
    metadata: unknown;
     
}
export const initUser = async (req: Request, res: Response) => {
    try {
        const reqData = req.body as InitUserReq;

        







        
    } catch (error) {
         res.status(500).json({ error: "Internal Server Error" });
    }
}

