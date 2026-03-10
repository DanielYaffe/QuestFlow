import request from "supertest";
import initApp from "../server";
import mongoose from "mongoose";
import { Express } from "express";
import userModel from "../models/userModel";
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { getLogedInUser, UserData, userData1, userData2 } from "./utils";

let app: Express;
let loginUser1: UserData;
let loginUser2: UserData;


beforeAll(async () => {
    app = await initApp();
    await userModel.deleteMany();
    loginUser1 = await getLogedInUser(userData1, app);
    loginUser2 = await getLogedInUser(userData2, app);
});

afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
});

describe("Auth Routes Tests", () => {

    test("Register User - Fail (User already exists in Database)", async () => {
        const response = await request(app).post("/auth/register").send(loginUser1);
        expect(response.statusCode).toBe(409);
    });

    test("Register User - Fail (Missing password)", async () => {
        const response = await request(app).post("/auth/register").send({
            email: "missing@password.com"
        });
        expect(response.statusCode).toBe(400);
    });

    test("Login User - Success", async () => {
        const response = await request(app).post("/auth/login").send(loginUser1);
        expect(response.statusCode).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.refreshToken).toBeDefined();
    });

    test("Login User - Fails (incorrect password)", async () => {
        const response = await request(app).post("/auth/login").send({
            email: loginUser1.email,
            password: "wrongpassword"
        });
        expect(response.statusCode).toBe(400);
    });

    let refreshToken: string;

    test("Refresh Token - Setup", async () => {
        const response = await request(app).post("/auth/login").send(loginUser1);
        expect(response.statusCode).toBe(200);
        refreshToken = response.body.refreshToken;
    });

    test("Refresh Token - Success", async () => {
        const response = await request(app).post("/auth/refresh").send({
            refreshToken: refreshToken
        });
        expect(response.statusCode).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.refreshToken).toBeDefined();
        refreshToken = response.body.refreshToken;
    });

    test("Refresh Token - Fail (Invalid token)", async () => {
        const response = await request(app).post("/auth/refresh").send({
            refreshToken: "invalid_refresh_token"
        });
        expect(response.statusCode).toBe(401);
    });

    test("Refresh Token - Fail (Missing token)", async () => {
        const response = await request(app).post("/auth/refresh").send({});
        expect(response.statusCode).toBe(400);
    });

    test("Refresh Token - Fail (User Not Found)", async () => {
        const loginRes = await request(app).post("/auth/login").send(loginUser2);
        const refreshToken = loginRes.body.refreshToken;

        const user2 = await userModel.findOne({ email: loginUser2.email });
        if (user2) await userModel.findByIdAndDelete(user2._id);

        const response = await request(app).post("/auth/refresh").send({ refreshToken });
        expect(response.statusCode).toBe(401);
    });
    test("Logout - Success", async () => {
        const loginRes = await request(app).post("/auth/login").send(loginUser1);
        const accessToken = loginRes.body.token;
        const freshRefreshToken = loginRes.body.refreshToken;

        const logoutRes = await request(app).post("/auth/logout")
            .set("Authorization", "Bearer " + accessToken)
            .send({
                refreshToken: freshRefreshToken
            });
        expect(logoutRes.statusCode).toBe(200);
    });

    test("Logout - Fail (Invalid token)", async () => {
        const loginRes = await request(app).post("/auth/login").send(loginUser1);
        const accessToken = loginRes.body.token;

        const response = await request(app).post("/auth/logout")
            .set("Authorization", "Bearer " + accessToken)
            .send({
                refreshToken: "invalid_token_format"
            });
        expect(response.statusCode).toBe(401);
    });

    test("Logout - Fail (Missing Refresh Token)", async () => {
        const loginRes = await request(app).post("/auth/login").send(loginUser1);
        const accessToken = loginRes.body.token;

        const response = await request(app).post("/auth/logout")
            .set("Authorization", "Bearer " + accessToken)
            .send({});
        expect(response.statusCode).toBe(400);
    });

    test("Logout - Fail (User Not Found)", async () => {
        const loginRes = await request(app).post("/auth/login").send(loginUser1);
        const accessToken = loginRes.body.token;
        const refreshToken = loginRes.body.refreshToken;

        const user = await userModel.findOne({ email: loginUser1.email });
        if (user) await userModel.findByIdAndDelete(user._id);

        const response = await request(app).post("/auth/logout")
            .set("Authorization", "Bearer " + accessToken)
            .send({ refreshToken });
        expect(response.statusCode).toBe(401);
    });

    test("Auth Middleware - Fail (No Authorization Header)", async () => {
        const response = await request(app).post("/posts").send({ title: "t", content: "c" });
        expect(response.statusCode).toBe(401);
    });

    test("Auth Middleware - Fail (Invalid Header Format)", async () => {
        const response = await request(app).post("/posts")
            .set("Authorization", "Basic invalid")
            .send({ title: "t", content: "c" });
        expect(response.statusCode).toBe(401);
    });

    test("Auth Middleware - Fail (User Deleted)", async () => {
        const tempUser = { email: "userdeleted@test.com", password: "123" };
        await request(app).post("/auth/register").send(tempUser);
        const loginRes = await request(app).post("/auth/login").send(tempUser);
        const accessToken = loginRes.body.token;

        const user = await userModel.findOne({ email: tempUser.email });
        if (user) await userModel.findByIdAndDelete(user._id);

        const response = await request(app).post("/posts")
            .set("Authorization", "Bearer " + accessToken)
            .send({ sender: "asdfsadf", text: "shoval.png", image: "shoval.png" });

        expect(response.statusCode).toBe(401);
    });
});