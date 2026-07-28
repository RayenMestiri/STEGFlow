import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  containsPersonalData,
  isStrongPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
} from './password.policy';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

@ValidatorConstraint({ name: 'stegStrongPassword' })
class StrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (!isStrongPassword(value)) return false;
    const dto = args.object as RegisterCitizenDto;
    return !containsPersonalData(value, [dto.email, dto.firstName, dto.lastName]);
  }

  defaultMessage(args: ValidationArguments) {
    const dto = args.object as RegisterCitizenDto;
    const value = args.value as string;
    if (
      isStrongPassword(value) &&
      containsPersonalData(value, [dto.email, dto.firstName, dto.lastName])
    ) {
      return 'Le mot de passe ne doit pas reprendre votre nom ni votre adresse e-mail.';
    }
    return PASSWORD_POLICY_MESSAGE;
  }
}

export class LoginDto {
  @ApiProperty({ example: 'superviseur@steg.tn' })
  @Transform(trimLower)
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(180)
  email!: string;

  @ApiProperty({ example: 'Admin2026!' })
  @IsString()
  @MinLength(8, { message: 'Mot de passe trop court.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class RegisterCitizenDto {
  @ApiProperty({ example: 'Mohamed' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères.' })
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Ben Salem' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: 'citoyen@steg.tn' })
  @Transform(trimLower)
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(180)
  email!: string;

  @ApiProperty({
    example: 'Menzah6!Orangers',
    minLength: PASSWORD_MIN_LENGTH,
    description: PASSWORD_POLICY_MESSAGE,
  })
  @IsString()
  @Validate(StrongPasswordConstraint)
  password!: string;

  @ApiPropertyOptional({ example: '+21620123456' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^(\+216)?[\s.-]?[2459]\d[\s.-]?\d{3}[\s.-]?\d{3}$/, {
    message: 'Numéro de téléphone tunisien invalide (ex. +216 20 123 456).',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'STEG-8042' })
  @Transform(trim)
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{4,24}$/, {
    message: 'Numéro de contrat invalide (lettres, chiffres et tirets).',
  })
  contractNumber?: string;

  @ApiPropertyOptional({ example: '14, Rue des Orangers' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(180)
  address?: string;

  @ApiPropertyOptional({ example: 'Tunis' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  governorate?: string;

  @ApiPropertyOptional({ example: 'El Menzah' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  delegation?: string;

  @ApiPropertyOptional({ example: 'El Menzah 6' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ example: 36.8427 })
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 10.1764 })
  @IsOptional()
  @IsNumber()
  @IsLongitude()
  longitude?: number;

  @ApiProperty({ example: true, description: "Acceptation des conditions d'utilisation." })
  @IsBoolean()
  @Equals(true, {
    message: "Vous devez accepter les conditions d'utilisation pour créer un compte.",
  })
  acceptTerms!: boolean;
}
