/*import { generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs"
import cloudinary from "../lib/cloudinary.js";

// Signup a new user
export const signup = async (req, res) => {
    const { fullName, email, password, bio } = req.body;

    try {
        if ( !fullName || !email || !password || !bio ) {
            return res.json({success: false, message: "Missing Details"})
        }
        const user = await User.findOne({email});
        if (user) {
            return res.json({success: false, message: "Account Already exists"})
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            fullName, email, password: hashedPassword, bio
        });

        const token = generateToken (newUser._id)

        res.json({success: true, userData: newUser, token, message: "Account Created succesfull"})
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})
    }
}

//controller to login a users
export const login= async (req, res) => {
    try {
        const { email, password } = req.body;
        const userData = await User.findOne({email})

        const isPasswordCorrect = await bcrypt.compare(password, userData.password);

        if(!isPasswordCorrect) {
            return res.json({success: false, message: "Login Successful"})
        }
        const token = generateToken (userDataer._id)

        res.json({success: true, userData: newUser, token, message: "Account Created succesfull"})
    } catch (error) {
        console.log(error);
        res.json({success: false, message: error.message})   
    }
}
// controller to check if user is authenticated
export const checkAuth = (req, res) => {
    res.json({success: TransitionEvent, user: req.user});
}

// controller to update user profile data
export const updateProfile = async (req, res) => {
    try {
        const { profilePic, bio, fullName } = req.body;

        const userId = req.user._id;
        let updatedUser ;

        if(!profilePic) {
            updatedUser = await User.findByIdAndUpdate(userId, { bio, fullName }, { new: true });
        } else {
            const upload = await cloudinary.uploader.upload(profilePic)
            updatedUser = await User.findByIdAndUpdate(userId, { profilePic: upload.secure_url, bio, fullName }, { new: true });
        }
        res.json({success: true, updatedUser})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}*/
import {
  generateAccessToken,
  generateRefreshToken,
} from "../middleware/auth.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";

// Signup a new user
export const signup = async (req, res) => {
  const { fullName, email, password, bio } = req.body;

  try {
    if (!fullName || !email || !password || !bio) {
      return res.json({ success: false, message: "Missing Details" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ success: false, message: "Account Already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      fullName,
      email,
      password: hashedPassword,
      bio,
    });

    const accessToken = generateAccessToken(newUser._id);
    const refreshToken = generateRefreshToken(newUser._id);

    // Store refresh token with user (in production, use Redis or secure storage)
    newUser.refreshToken = refreshToken;
    await newUser.save();

    res.json({
      success: true,
      userData: newUser,
      accessToken,
      refreshToken,
      message: "Account Created successfully",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Login a user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const userData = await User.findOne({ email });

    if (!userData) {
      return res.json({ success: false, message: "User not found" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, userData.password);
    if (!isPasswordCorrect) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(userData._id);
    const refreshToken = generateRefreshToken(userData._id);

    // Store refresh token with user
    userData.refreshToken = refreshToken;
    await userData.save();

    res.json({
      success: true,
      userData,
      accessToken,
      refreshToken,
      message: "Login Successful",
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Refresh access token
export const refreshToken = async (req, res) => {
  try {
    const user = req.user;
    const refreshToken = req.refreshToken;

    // Verify refresh token matches stored token
    if (user.refreshToken !== refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Update stored refresh token
    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Token refresh failed" });
  }
};

// Logout (invalidate refresh token)
export const logout = async (req, res) => {
  try {
    const user = req.user;
    user.refreshToken = null;
    await user.save();

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
};

// Check authentication
export const checkAuth = (req, res) => {
  res.json({ success: true, user: req.user });
};

// Update user profile
export const updateProfile = async (req, res) => {
  try {
    const { profilePic, bio, fullName } = req.body;
    const userId = req.user._id;
    let updatedUser;

    if (!profilePic) {
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { bio, fullName },
        { new: true }
      );
    } else {
      const upload = await cloudinary.uploader.upload(profilePic);
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { profilePic: upload.secure_url, bio, fullName },
        { new: true }
      );
    }

    res.json({ success: true, updatedUser });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
