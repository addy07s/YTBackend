import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/Apiresponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens=async(userid)=>{
  try {
    const user=await User.findById(userid)
    const acessToken= user.generateAccessToken()
    const refreshToken= user.generateRefreshToken() 

    user.refreshToken=refreshToken
    await user.save({validateBeforeSave:false})
    return{acessToken, refreshToken}

  } catch (error) {
    throw new ApiError(500,"something went wrong while generating access and refresh tokens")
    
  }
}

const registerUser = asyncHandler(async (req, res) => {
  const { email, fullName, username, password } = req.body;
  console.log("email:", email);
  if (
    [email, fullName, username, password].some((field) => 
      field?.trim() === ""   // logic to check if all fields are given
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }]
  });

  if (existedUser) {
    throw new ApiError(409, "Username or email already registered");
  }

  const avatarLocalPath=req.files?.avatar[0].path;
  console.log("req.files:",req.files);
 // const imageLocalPath=req.files?.coverImage[0]?.path;
let imageLocalPath;
if (req.files &&Array.isArray(req.files.coverImage) && req.files.coverImage.length>0) {
imageLocalPath=req.files.coverImage[0].path
  
}
  if(!avatarLocalPath){
    throw new ApiError(400,'avatar not found');
  }
//   if(!imageLocalPath){
//     throw new ApiError(400,'cover Image not found');
//   }

  

  const uploadedAvatar= await uploadOnCloudinary(avatarLocalPath);
  const uploadedImage= await uploadOnCloudinary(imageLocalPath);

  if(!uploadedAvatar){
    throw new ApiError(400,'Avatar not present');
  }

  const user= await User.create({
    fullName,
    avatar:uploadedAvatar.url,
    coverImage:uploadedImage?.url||"",
    email,
    password,
    username:username.toLowerCase()

  })
  const createdUser=await User.findById(user._id).select("-password -refreshToken");
if(!createdUser){
    throw new ApiError(500,"internal server error while registering");
}

  return res.status(201).json(
new ApiResponse(200,createdUser,"user registered successfully")
  )

});

const loginUser=asyncHandler(async(req,res)=>{
  const {email,username,password}=req.body;
  if(!username&&!email){
    throw new ApiError(400,"username or email not entered properly")
  }
  const user =await User.findOne({$or:[{username},{email}]
  })

  if(!user){
    throw new ApiError(404,"user not found")
  }
  const isPasswordValid = await user.isPasswordCorrect(password)

  if(!isPasswordValid){
    throw new ApiError(401,"wrong password entered")
  }
    
  const {accessToken,refreshToken}=await generateAccessAndRefreshTokens(user._id)

  const loggedinUser=await User.findById(user._id).select("-password -refreshToken -")

  const options={
    httpOnly:true,
    secure:true
  }

  return res.
  status(200).
  cookie("accessToken",accessToken,options)
 .cookie("refreshToken",refreshToken,options)
 .json(
  new ApiResponse(200,{user:loggedinUser,accessToken,refreshToken },
    "User logged in successfully"
  )
)
  
})

const logoutUser=asyncHandler(async (req,res) => {

  User.findByIdAndUpdate(req.user._id,{
    $set:{
      refreshToken:undefined
    }
  },{
    new:true
  })

const options={
  httpOnly:true,
  secure:true
}
return res.status
.clearCookie("accessToken",options) 
.refreshCookie("refreshToken",options) 
.json(new ApiResponse(200,{},"user logged out"))


})

const refreshAccessToken=asyncHandler(async (req,res) => {
  const incomingRefreshToken=req.cookie.refreshToken || req.body.refreshToken

  if(!incomingRefreshToken){
    throw new ApiError(401,"unauthorized request")
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET
    )
  
    const user = await User.findById(decodedToken?._id)
    if(!user){
      throw new ApiError(401,"Invalid Refresh Token")
    } 
  
    if(incomingRefreshToken !== user?.refreshToken){
      throw new ApiError(401,"refresh token is expired or used")
    }
  
    const options={
      httpOnly:true,
      secure:true
    }
  
    const {accessToken,newrefreshToken} = await generateAccessAndRefreshTokens(user._id)
  
    return res.status(200).cookie("accessToken",accessToken,options)
    .cookie("refreshToken",newrefreshToken,options)
    .json(new ApiResponse(200,{
      accessToken, refreshToken:newrefreshToken},
      "Access Token refreshed"
    ))
  } catch (error) {
    throw new ApiError(401,error?.message||"invalid refresh token")
    }

  
})

const changeCurrentPassword=asyncHandler(async (req,res) => {
  
  const{oldPassword, newPassword,confirmPassword}=req.body
  const user = await User.findById(req?.user=_id)

  if(!(newPassword===confirmPassword)){
    throw new ApiError(400,"passwords dont match")
  }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

  if(!isPasswordCorrect){
    throw new ApiError(400,"invalid password")
  }

  user.password=newPassword
  await user.save({validateBeforeSave:false})

  return res.satus(200)
  .json(new ApiResponse(200,{},"Password changed succesfully"))

})

const getCurrentUser=asyncHandler(async (req,res) => {

  return res.status(200)
  .json( new ApiResponse(200,req.user,"current user fetched successfully"))
})

const updateDetails=asyncHandler(async (req,res) => {

  const{fullName,email}=req.body
  if(!fullName||!email){
    throw new ApiError(400,"fullname or email not given")
  }

  const user = User.findByIdAndUpdate(req.user?._id,
    {
        $set:{
          fullName,
          email
        }
  },
  {new:true}).select("-password")

  return res.status(200).json(new ApiResponse(200,user,"account details updated successfully"))

})


export { registerUser,loginUser, logoutUser,refreshAccessToken,changeCurrentPassword,getCurrentUser,updateDetails

  
 };