import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../../application/services/users.service';
import { JwtAuthGuard, ReqUser } from '../security/jwt.guard';
import { ChangePasswordDto, TwoFactorDto, UpdateProfileDto } from '../dtos/user.dto';

@ApiTags('users')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('/users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Signed-in user profile' })
  me(@ReqUser() user: { userId: string }) {
    return this.service.me(user.userId);
  }

  @Patch('me')
  @ApiOkResponse({ description: 'Updated profile' })
  update(@ReqUser() user: { userId: string }, @Body() dto: UpdateProfileDto) {
    return this.service.updateProfile(user.userId, dto);
  }

  @Post('me/password')
  @HttpCode(200)
  @ApiOkResponse({ schema: { example: { changed: true } } })
  changePassword(@ReqUser() user: { userId: string }, @Body() dto: ChangePasswordDto) {
    return this.service.changePassword(user.userId, dto);
  }

  @Patch('me/two-factor')
  @ApiOkResponse({ description: 'Updated profile' })
  setTwoFactor(@ReqUser() user: { userId: string }, @Body() dto: TwoFactorDto) {
    return this.service.setTwoFactor(user.userId, dto);
  }
}
