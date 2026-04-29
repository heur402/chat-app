import express from "express";
import {
  checkAuth,
  login,
  signup,
  updateProfile,
  refreshToken,
  logout,
} from "../controllers/userController.js";
import { protectRoute, verifyRefreshToken } from "../middleware/auth.js";

const userRouter = express.Router();

userRouter.post("/signup", signup);
userRouter.post("/login", login);
userRouter.post("/refresh", verifyRefreshToken, refreshToken);
userRouter.post("/logout", protectRoute, logout);
userRouter.put("/update-profile", protectRoute, updateProfile);
userRouter.get("/check", protectRoute, checkAuth);

export default userRouter;