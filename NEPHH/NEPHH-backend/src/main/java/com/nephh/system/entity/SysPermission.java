package com.nephh.system.entity;
import lombok.Data;
import com.baomidou.mybatisplus.annotation.TableName;
@Data
@TableName("sys_permission")
public class SysPermission { private Long id; private String code; private String name; }
