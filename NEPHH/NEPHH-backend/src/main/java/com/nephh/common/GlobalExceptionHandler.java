package com.nephh.common;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.security.access.AccessDeniedException;
import jakarta.validation.ConstraintViolationException;
@RestControllerAdvice
public class GlobalExceptionHandler {
 private static final Logger log=LoggerFactory.getLogger(GlobalExceptionHandler.class);
 @ExceptionHandler({BusinessException.class,ConstraintViolationException.class,HttpMessageNotReadableException.class})
 ResponseEntity<ApiResponse<Void>> badRequest(Exception e) { return ResponseEntity.badRequest().body(ApiResponse.error(400,"请求参数不合法")); }
 @ExceptionHandler(MethodArgumentNotValidException.class)
 ResponseEntity<ApiResponse<Void>> validation(MethodArgumentNotValidException e) {
  var error=e.getBindingResult().getFieldError();
  return ResponseEntity.badRequest().body(ApiResponse.error(400,error==null?"参数校验失败":error.getField()+": "+error.getDefaultMessage()));
 }
 @ExceptionHandler(NoResourceFoundException.class)
 ResponseEntity<ApiResponse<Void>> notFound(Exception e) { return ResponseEntity.status(404).body(ApiResponse.error(404,"接口不存在")); }
 @ExceptionHandler(AccessDeniedException.class)
 ResponseEntity<ApiResponse<Void>> denied(Exception e) { return ResponseEntity.status(403).body(ApiResponse.error(403,"权限不足")); }
 @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
 ResponseEntity<ApiResponse<Void>> status(org.springframework.web.server.ResponseStatusException e) { return ResponseEntity.status(e.getStatusCode()).body(ApiResponse.error(e.getStatusCode().value(),e.getReason())); }
 @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
 ResponseEntity<ApiResponse<Void>> conflict(Exception e) { return ResponseEntity.status(409).body(ApiResponse.error(409,"数据重复或仍有关联记录，无法完成操作")); }
 @ExceptionHandler({IllegalArgumentException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,org.springframework.web.bind.MissingServletRequestParameterException.class,org.springframework.web.multipart.support.MissingServletRequestPartException.class})
 ResponseEntity<ApiResponse<Void>> invalidValue(Exception e) { return ResponseEntity.badRequest().body(ApiResponse.error(400,"参数格式不正确，请检查数字、时间或必填字段")); }
 @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
 ResponseEntity<ApiResponse<Void>> tooLarge(Exception e) { return ResponseEntity.status(413).body(ApiResponse.error(413,"附件过大，单张图片最多5MB")); }
 @ExceptionHandler(Exception.class)
 ResponseEntity<ApiResponse<Void>> unexpected(Exception e) { log.error("Unhandled request error",e); return ResponseEntity.internalServerError().body(ApiResponse.error(500,"服务器内部错误")); }
}
