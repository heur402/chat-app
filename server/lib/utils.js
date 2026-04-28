import jwt from "jsonwebtoken";

// function to generate token for users
export const generateToken = (userId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("Missing JWT_SECRET environment variable");
    }
    const token = jwt.sign({userId}, process.env.JWT_SECRET)
    return token;
}